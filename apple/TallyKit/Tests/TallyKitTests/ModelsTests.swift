import XCTest
@testable import TallyKit

final class ModelsTests: XCTestCase {
    func testDayStatusDecodesServerShape() throws {
        let json = """
        {"date":"2026-09-09","activities":[{"id":1,"key":"pushups","label":"Push-ups","kind":"counter","unit":"reps","goal":50,"done":20,"met":false,"streak":3},
        {"id":2,"key":"bodyweight","label":"Weight","kind":"measure","unit":"lb","goal":null,"done":null,"met":false,"streak":0}],
        "behind":true,"calories":null,"summary":"Behind: Push-ups 20/50"}
        """.data(using: .utf8)!
        let s = try JSONDecoder().decode(DayStatus.self, from: json)
        XCTAssertEqual(s.openDrills.map(\.key), ["pushups"])
        XCTAssertNil(s.activities[1].done)
    }

    func testLogRequestEncodesLikeTheShortcutBody() throws {
        let data = try JSONEncoder().encode(LogRequest.counter(activityKey: "pushups", delta: 5))
        let obj = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        XCTAssertEqual(obj["type"] as? String, "counter")
        XCTAssertEqual(obj["delta"] as? Double, 5)
    }
}
