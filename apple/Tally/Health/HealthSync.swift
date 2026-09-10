import Foundation
import HealthKit
import TallyKit

/// Reads HealthKit and posts the same payload Health Auto Export sends, so
/// the server (src/app/api/health-sync/route.ts, haeSchema) needs no changes.
/// Anchored queries keep each sync incremental; observer queries with
/// background delivery wake us when new samples land.
@MainActor
final class HealthSync {
    static let shared = HealthSync()
    private let store = HKHealthStore()
    private let defaults = UserDefaults.standard

    // HealthKit type → the metric name the server's METRIC_RULES already match.
    private let quantityMetrics: [(HKQuantityTypeIdentifier, String, HKUnit)] = [
        (.activeEnergyBurned, "active_energy", .kilocalorie()),
        (.basalEnergyBurned, "basal_energy", .kilocalorie()),
        (.stepCount, "step_count", .count()),
        (.appleExerciseTime, "apple_exercise_time", .minute()),
        (.distanceWalkingRunning, "walking_running_distance", .mile()),
        (.restingHeartRate, "resting_heart_rate", HKUnit.count().unitDivided(by: .minute())),
        (.heartRateVariabilitySDNN, "heart_rate_variability", .secondUnit(with: .milli)),
        (.vo2Max, "vo2_max", HKUnit.literUnit(with: .milli).unitDivided(by: HKUnit.gramUnit(with: .kilo).unitMultiplied(by: .minute()))),
        (.bodyMass, "weight_body_mass", .pound()),
    ]

    private var readTypes: Set<HKObjectType> {
        var s: Set<HKObjectType> = [HKObjectType.workoutType(), HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!]
        for (id, _, _) in quantityMetrics { s.insert(HKObjectType.quantityType(forIdentifier: id)!) }
        return s
    }

    var available: Bool { HKHealthStore.isHealthDataAvailable() }

    var statusLine: String {
        guard available else { return "Health data isn't available on this device." }
        if let last = defaults.object(forKey: "health.lastSync") as? Date {
            return "Last synced \(last.formatted(date: .abbreviated, time: .shortened))."
        }
        return "Not synced yet — tap Allow, then Sync now."
    }

    func requestAuthorization() async {
        guard available else { return }
        try? await store.requestAuthorization(toShare: [], read: readTypes)
        defaults.set(true, forKey: "health.authorized")
        await startIfAuthorized()
    }

    /// Observer queries + background delivery: HealthKit launches the app in
    /// the background when new samples arrive and we push a fresh sync.
    func startIfAuthorized() async {
        guard available, defaults.bool(forKey: "health.authorized") else { return }
        for type in readTypes.compactMap({ $0 as? HKSampleType }) {
            let q = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, done, _ in
                Task { @MainActor in _ = await self?.syncNow(); done() }
            }
            store.execute(q)
            try? await store.enableBackgroundDelivery(for: type, frequency: .hourly)
        }
    }

    /// Re-reads the last 3 days (covers late-arriving watch data) and posts.
    /// Idempotent server-side, so overlapping windows are fine.
    @discardableResult
    func syncNow() async -> String {
        guard available else { return statusLine }
        let end = Date()
        let start = Calendar.current.date(byAdding: .day, value: -3, to: Calendar.current.startOfDay(for: end))!
        do {
            var metrics: [[String: Any]] = []
            for (id, name, unit) in quantityMetrics {
                let points = try await points(id, unit: unit, start: start, end: end)
                if !points.isEmpty { metrics.append(["name": name, "units": unit.unitString, "data": points]) }
            }
            let sleep = try await sleepPoints(start: start, end: end)
            if !sleep.isEmpty { metrics.append(["name": "sleep_analysis", "units": "hr", "data": sleep]) }
            let workouts = try await workouts(start: start, end: end)
            let payload = try JSONSerialization.data(withJSONObject: ["data": ["metrics": metrics, "workouts": workouts]])
            let r = try await TallyAPI.shared.healthSync(payload: payload)
            defaults.set(Date(), forKey: "health.lastSync")
            return "Synced: \(r["workouts"] ?? 0) workouts, \(r["metricDays"] ?? 0) days of metrics."
        } catch {
            return "Sync failed: \(error.localizedDescription)"
        }
    }

    // MARK: - Queries

    private static let haeDate: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH:mm:ss Z"; f.locale = Locale(identifier: "en_US_POSIX"); return f
    }()

    /// One point per sample, HAE-style {date, qty}; the server aggregates per day.
    private func points(_ id: HKQuantityTypeIdentifier, unit: HKUnit, start: Date, end: Date) async throws -> [[String: Any]] {
        let type = HKQuantityType.quantityType(forIdentifier: id)!
        let pred = HKQuery.predicateForSamples(withStart: start, end: end)
        let samples: [HKQuantitySample] = try await withCheckedThrowingContinuation { cont in
            let q = HKSampleQuery(sampleType: type, predicate: pred, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, s, e in
                if let e { cont.resume(throwing: e) } else { cont.resume(returning: (s as? [HKQuantitySample]) ?? []) }
            }
            store.execute(q)
        }
        return samples.map { ["date": Self.haeDate.string(from: $0.startDate), "qty": $0.quantity.doubleValue(for: unit)] }
    }

    private func sleepPoints(start: Date, end: Date) async throws -> [[String: Any]] {
        let type = HKCategoryType.categoryType(forIdentifier: .sleepAnalysis)!
        let pred = HKQuery.predicateForSamples(withStart: start, end: end)
        let samples: [HKCategorySample] = try await withCheckedThrowingContinuation { cont in
            let q = HKSampleQuery(sampleType: type, predicate: pred, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, s, e in
                if let e { cont.resume(throwing: e) } else { cont.resume(returning: (s as? [HKCategorySample]) ?? []) }
            }
            store.execute(q)
        }
        let asleep: Set<Int> = [HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue, HKCategoryValueSleepAnalysis.asleepCore.rawValue, HKCategoryValueSleepAnalysis.asleepDeep.rawValue, HKCategoryValueSleepAnalysis.asleepREM.rawValue]
        // Sleep belongs to the morning it ends on, which is how HAE reports it.
        return samples.filter { asleep.contains($0.value) }.map {
            ["date": Self.haeDate.string(from: $0.endDate), "asleep": $0.endDate.timeIntervalSince($0.startDate) / 3600]
        }
    }

    private func workouts(start: Date, end: Date) async throws -> [[String: Any]] {
        let pred = HKQuery.predicateForSamples(withStart: start, end: end)
        let samples: [HKWorkout] = try await withCheckedThrowingContinuation { cont in
            let q = HKSampleQuery(sampleType: .workoutType(), predicate: pred, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, s, e in
                if let e { cont.resume(throwing: e) } else { cont.resume(returning: (s as? [HKWorkout]) ?? []) }
            }
            store.execute(q)
        }
        return samples.map { w in
            var d: [String: Any] = [
                "name": Self.name(for: w.workoutActivityType),
                "start": Self.haeDate.string(from: w.startDate),
                "duration": w.duration / 60,
            ]
            if let kcal = w.statistics(for: HKQuantityType(.activeEnergyBurned))?.sumQuantity()?.doubleValue(for: .kilocalorie()) {
                d["activeEnergyBurned"] = ["qty": kcal, "units": "kcal"]
            }
            if let mi = w.statistics(for: HKQuantityType(.distanceWalkingRunning))?.sumQuantity()?.doubleValue(for: .mile())
                ?? w.statistics(for: HKQuantityType(.distanceSwimming))?.sumQuantity()?.doubleValue(for: .mile()) {
                d["distance"] = ["qty": mi, "units": "mi"]
            }
            return d
        }
    }

    /// Names chosen to hit the server's HAE_TYPE_MAP regexes.
    private static func name(for t: HKWorkoutActivityType) -> String {
        switch t {
        case .running: return "Running"
        case .walking, .hiking: return "Walking"
        case .swimming: return "Swimming"
        case .climbing: return "Climbing"
        case .traditionalStrengthTraining, .functionalStrengthTraining, .coreTraining: return "Strength Training"
        case .basketball: return "Basketball"
        case .soccer: return "Soccer"
        case .tennis: return "Tennis"
        case .pickleball: return "Pickleball"
        case .volleyball: return "Volleyball"
        default: return "Other (\(t.rawValue))"
        }
    }
}
