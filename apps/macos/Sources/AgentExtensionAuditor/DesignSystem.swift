import SwiftUI

enum AuditorTheme {
    static func adaptive(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(nsColor: NSColor(name: nil) { appearance in
            let rgb = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light
            return NSColor(srgbRed: Double((rgb >> 16) & 255) / 255,
                           green: Double((rgb >> 8) & 255) / 255, blue: Double(rgb & 255) / 255, alpha: 1)
        })
    }
    static let accent = adaptive(0x315F28, 0xA4DE91)
    static let accentFill = adaptive(0x83D46D, 0x83D46D)
    static let accentText = Color(red: 24/255, green: 53/255, blue: 22/255)
    static let canvas = adaptive(0xF6F5F2, 0x1C201C)
    static let surface = adaptive(0xFFFFFF, 0x282E28)
    static let sidebar = adaptive(0xEEEEE7, 0x272C25)
    static let inset = adaptive(0xF4F6EF, 0x394235)
    static let primary = adaptive(0x262A27, 0xEEF0E9)
    static let secondary = adaptive(0x656B65, 0xBCC3B9)
    static let border = adaptive(0xE5E7E1, 0x465044)
}

extension Severity {
    var color: Color {
        switch self {
        case .critical: AuditorTheme.adaptive(0xB81524, 0xFF929A)
        case .high: AuditorTheme.adaptive(0xAB3818, 0xFFAA83)
        case .medium: AuditorTheme.adaptive(0x825900, 0xEBC777)
        case .low: AuditorTheme.adaptive(0x306B33, 0xA2D997)
        case .info: AuditorTheme.adaptive(0x236688, 0x90C9EA)
        }
    }

    var symbol: String {
        switch self {
        case .critical: "exclamationmark.octagon.fill"
        case .high: "exclamationmark.triangle.fill"
        case .medium: "exclamationmark.circle.fill"
        case .low: "checkmark.shield.fill"
        case .info: "info.circle.fill"
        }
    }
}

extension InventoryType {
    var symbol: String {
        switch self {
        case .skill: "puzzlepiece.extension.fill"
        case .plugin: "shippingbox.fill"
        case .mcpServer: "server.rack"
        case .hook: "link"
        case .config: "slider.horizontal.3"
        case .package: "cube.box.fill"
        }
    }
}

extension SidebarSection {
    var symbol: String {
        switch self {
        case .overview: "rectangle.3.group.fill"
        case .findings: "list.bullet.rectangle.portrait.fill"
        case .inventory(let type): type.symbol
        case .locations: "scope"
        case .settings: "gearshape.fill"
        }
    }
}

private struct CardSurfaceModifier: ViewModifier {
    @Environment(\.colorSchemeContrast) private var contrast
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    let cornerRadius: CGFloat
    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        let strong = contrast == .increased || reduceTransparency
        content
            .background(AuditorTheme.surface, in: shape)
            .overlay(shape.stroke(strong ? AuditorTheme.primary.opacity(0.65) : AuditorTheme.border, lineWidth: 1))
            .shadow(color: .black.opacity(strong ? 0 : 0.025), radius: 3, y: 2)
    }
}

extension View {
    // Retain the shared call-site API; working data surfaces are now fully opaque.
    func auditorGlass(tint: Color? = nil, cornerRadius: CGFloat = 18) -> some View {
        modifier(CardSurfaceModifier(cornerRadius: cornerRadius))
    }
}

struct AuditorCanvas: View {
    var body: some View { AuditorTheme.canvas.ignoresSafeArea().allowsHitTesting(false) }
}

struct AuditorCardButtonStyle: ButtonStyle {
    @State private var hovering = false
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .overlay(RoundedRectangle(cornerRadius: 18)
                .stroke(hovering || configuration.isPressed ? AuditorTheme.accent : Color.clear, lineWidth: 1))
            .onHover { hovering = $0 }
    }
}

struct AuditorPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.callout.weight(.semibold))
            .padding(.horizontal, 18).padding(.vertical, 10)
            .foregroundStyle(AuditorTheme.accentText)
            .background(AuditorTheme.accentFill.opacity(configuration.isPressed ? 0.8 : 1), in: RoundedRectangle(cornerRadius: 10))
    }
}

struct AuditorQuietButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.system(size: 13))
            .padding(.horizontal, 12).frame(minHeight: 38)
            .foregroundStyle(AuditorTheme.primary)
            .background(AuditorTheme.surface.opacity(configuration.isPressed ? 0.65 : 1), in: RoundedRectangle(cornerRadius: 9))
            .overlay(RoundedRectangle(cornerRadius: 9).stroke(AuditorTheme.secondary.opacity(0.75), lineWidth: 1))
            .opacity(enabled ? 1 : 0.5)
    }
}

struct GlassGroup<Content: View>: View {
    private let content: Content
    init(@ViewBuilder content: () -> Content) { self.content = content() }
    var body: some View { content }
}
