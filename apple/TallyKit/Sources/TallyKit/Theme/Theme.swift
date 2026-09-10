import CoreText
import SwiftUI

// The web app's gym-notebook look, in SwiftUI. Same hex values as globals.css
// so the phone and the site read as one product.
public enum Ink {
    public static let paper = Color(red: 0xf7 / 255, green: 0xf4 / 255, blue: 0xec / 255)
    public static let ink = Color(red: 0x16 / 255, green: 0x13 / 255, blue: 0x0d / 255)
    public static let rule = Color(red: 0xbf / 255, green: 0xd0 / 255, blue: 0xde / 255)
    public static let margin = Color(red: 0xd6 / 255, green: 0x48 / 255, blue: 0x2f / 255)
    public static let highlight = Color(red: 0xff / 255, green: 0xe2 / 255, blue: 0x4a / 255)
    public static let pencil = Color(red: 0x8b / 255, green: 0x85 / 255, blue: 0x78 / 255)
}

public enum TallyFont {
    /// Staatliches when the bundled font is registered, otherwise a condensed system fallback.
    public static func display(_ size: CGFloat) -> Font {
        registerOnce()
        return .custom("Staatliches-Regular", size: size, relativeTo: .title)
    }
    public static func marker(_ size: CGFloat) -> Font {
        registerOnce()
        return .custom("PermanentMarker-Regular", size: size, relativeTo: .body)
    }

    private static var registered = false
    private static func registerOnce() {
        guard !registered else { return }
        registered = true
        for name in ["Staatliches-Regular", "PermanentMarker-Regular"] {
            #if SWIFT_PACKAGE
            let bundle = Bundle.module
            #else
            let bundle = Bundle.main
            #endif
            guard let url = bundle.url(forResource: name, withExtension: "ttf") else { continue }
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }
}

/// Ruled notebook paper: blue horizontal rules every 32pt and one red margin line.
public struct RuledPaper: View {
    public init() {}
    public var body: some View {
        Canvas { ctx, size in
            ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Ink.paper))
            var y: CGFloat = 32
            while y < size.height {
                ctx.fill(Path(CGRect(x: 0, y: y - 1, width: size.width, height: 1)), with: .color(Ink.rule))
                y += 32
            }
            ctx.fill(Path(CGRect(x: 36, y: 0, width: 2, height: size.height)), with: .color(Ink.margin))
        }
        .ignoresSafeArea()
    }
}

/// The whiteboard cell: 2pt ink border with a hard 3pt offset shadow.
public struct MarkerBox: ViewModifier {
    public func body(content: Content) -> some View {
        content
            .background(Color.white.opacity(0.55))
            .overlay(Rectangle().stroke(Ink.ink, lineWidth: 2))
            .background(Rectangle().fill(Ink.ink).offset(x: 3, y: 3))
    }
}

public struct InkButton: ButtonStyle {
    public init() {}
    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(TallyFont.display(22))
            .foregroundStyle(Ink.paper)
            .padding(.horizontal, 16).padding(.vertical, 10)
            .background(Ink.ink)
            .overlay(Rectangle().stroke(Ink.ink, lineWidth: 2))
            .background(Rectangle().fill(Ink.ink.opacity(0.35)).offset(x: configuration.isPressed ? 1 : 3, y: configuration.isPressed ? 1 : 3))
            .offset(x: configuration.isPressed ? 2 : 0, y: configuration.isPressed ? 2 : 0)
    }
}

public struct PaperButton: ButtonStyle {
    public init() {}
    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(TallyFont.display(18))
            .foregroundStyle(Ink.ink)
            .padding(.horizontal, 12).padding(.vertical, 8)
            .background(Color.white.opacity(0.7))
            .overlay(Rectangle().stroke(Ink.ink, lineWidth: 2))
            .offset(x: configuration.isPressed ? 1 : 0, y: configuration.isPressed ? 1 : 0)
    }
}

public extension View {
    func markerBox() -> some View { modifier(MarkerBox()) }
    /// Yellow highlighter swipe behind a met goal.
    func highlighted(_ on: Bool = true) -> some View {
        background(on ? Ink.highlight : .clear)
    }
}
