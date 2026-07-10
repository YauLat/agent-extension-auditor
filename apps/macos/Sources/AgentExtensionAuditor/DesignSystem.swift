import SwiftUI

enum AuditorTheme {
    static let accent = Color(red: 0.02, green: 0.39, blue: 0.43)
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
    let tint: Color?
    let cornerRadius: CGFloat

    @ViewBuilder
    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)

        if #available(macOS 26.0, *) {
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
    func auditorGlass(tint: Color? = nil, cornerRadius: CGFloat = 8) -> some View {
        modifier(GlassSurfaceModifier(tint: tint, cornerRadius: cornerRadius))
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
