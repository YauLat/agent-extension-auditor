import SwiftUI

enum AuditorTheme {
    static let accent = Color(nsColor: NSColor(name: nil) { appearance in
        if appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua {
            return NSColor(srgbRed: 0.38, green: 0.83, blue: 0.86, alpha: 1)
        }
        return NSColor(srgbRed: 0.02, green: 0.39, blue: 0.43, alpha: 1)
    })
    static let canvas = Color(nsColor: .windowBackgroundColor)
    static let border = Color.primary.opacity(0.10)
}

extension Severity {
    var color: Color {
        switch self {
        case .critical: Color(red: 0.72, green: 0.08, blue: 0.12)
        case .high: Color(red: 0.88, green: 0.25, blue: 0.10)
        case .medium: Color(red: 0.78, green: 0.52, blue: 0.02)
        case .low: Color(red: 0.18, green: 0.53, blue: 0.24)
        case .info: Color(red: 0.05, green: 0.40, blue: 0.58)
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

private struct GlassSurfaceModifier: ViewModifier {
    @Environment(\.colorSchemeContrast) private var contrast
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    let tint: Color?
    let cornerRadius: CGFloat

    @ViewBuilder
    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)

        if contrast == .increased || reduceTransparency {
            content
                .background(Color(nsColor: .controlBackgroundColor), in: shape)
                .overlay(shape.stroke(Color.primary.opacity(0.6), lineWidth: 1))
        } else if #available(macOS 26.0, *) {
            if let tint {
                content.glassEffect(.regular.tint(tint.opacity(0.16)), in: shape)
            } else {
                content.glassEffect(.regular, in: shape)
            }
        } else {
            content
                .background(.regularMaterial, in: shape)
                .overlay(shape.stroke(AuditorTheme.border, lineWidth: 1))
        }
    }
}

extension View {
    func auditorGlass(tint: Color? = nil, cornerRadius: CGFloat = 14) -> some View {
        modifier(GlassSurfaceModifier(tint: tint, cornerRadius: cornerRadius))
    }
}

struct AuditorCanvas: View {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast

    var body: some View {
        ZStack {
            AuditorTheme.canvas
            if !reduceTransparency && contrast != .increased {
                LinearGradient(
                    colors: [AuditorTheme.accent.opacity(0.07), .clear, Color.blue.opacity(0.025)],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }
}

struct AuditorCardButtonStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var hovering = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .overlay(RoundedRectangle(cornerRadius: 14)
                .stroke(AuditorTheme.accent.opacity(hovering ? 0.4 : 0), lineWidth: 1))
            .shadow(color: .black.opacity(hovering ? 0.09 : 0.025), radius: hovering ? 12 : 3, y: hovering ? 5 : 1)
            .scaleEffect(reduceMotion ? 1 : (configuration.isPressed ? 0.985 : 1))
            .offset(y: reduceMotion || !hovering || configuration.isPressed ? 0 : -2)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.18), value: hovering)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: configuration.isPressed)
            .onHover { hovering = $0 }
    }
}

struct GlassGroup<Content: View>: View {
    private let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    @ViewBuilder
    var body: some View {
        if #available(macOS 26.0, *) {
            GlassEffectContainer(spacing: 12) {
                content
            }
        } else {
            content
        }
    }
}
