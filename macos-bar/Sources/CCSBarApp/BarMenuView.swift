import SwiftUI
import AppKit
import CCSBarCore

/// Dropdown content for the menu bar: a CCS-branded header, usage analytics,
/// per-account rows + actions, an offline state when CCS isn't running, and
/// footer controls.
struct BarMenuView: View {
  @ObservedObject var viewModel: BarViewModel

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      header
      Divider()

      if viewModel.offline {
        offlineState.padding(14)
      } else {
        ScrollView {
          VStack(alignment: .leading, spacing: 12) {
            if let analytics = viewModel.analytics {
              BarAnalyticsView(analytics: analytics)
            }

            VStack(alignment: .leading, spacing: 8) {
              SectionLabel("Accounts")
              if viewModel.rows.isEmpty {
                Text("No accounts configured")
                  .font(.caption)
                  .foregroundStyle(.secondary)
              } else {
                ForEach(viewModel.rows) { row in
                  BarRowView(row: row, viewModel: viewModel)
                }
              }
            }
          }
          .padding(14)
        }
        .frame(maxHeight: 520)
      }

      Divider()
      footer
    }
    .frame(width: 340)
    .onAppear { viewModel.onOpen() }
  }

  private var header: some View {
    HStack(spacing: 8) {
      Image(nsImage: MenuBarIcon.headerImage())
      VStack(alignment: .leading, spacing: 0) {
        Text("CCS").font(.headline)
        Text("usage & accounts").font(.caption2).foregroundStyle(.secondary)
      }
      Spacer()
      if viewModel.isRefreshing {
        ProgressView().controlSize(.small)
      }
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 10)
  }

  private var offlineState: some View {
    VStack(alignment: .leading, spacing: 6) {
      Label("CCS is not running", systemImage: "bolt.slash.fill")
        .font(.body)
      Text("Start CCS, then reopen this menu.")
        .font(.caption)
        .foregroundStyle(.secondary)
      Button("Retry") { viewModel.reconnect(); viewModel.onOpen() }
        .controlSize(.small)
    }
  }

  private var footer: some View {
    HStack(spacing: 10) {
      Button {
        openDashboard()
      } label: {
        Label("Dashboard", systemImage: "chart.bar.xaxis")
      }
      Button {
        viewModel.toggleIconStyle()
      } label: {
        Label(
          viewModel.iconStyle == .color ? "Color" : "Mono",
          systemImage: viewModel.iconStyle == .color ? "paintpalette" : "circle.lefthalf.filled"
        )
      }
      .help("Toggle the menu-bar icon between color and monochrome")
      Spacer()
      Button {
        viewModel.onOpen()
      } label: {
        Image(systemName: "arrow.clockwise")
      }
      .help("Refresh")
      Button {
        NSApplication.shared.terminate(nil)
      } label: {
        Image(systemName: "power")
      }
      .help("Quit CCS Bar")
    }
    .buttonStyle(.borderless)
    .font(.caption)
    .padding(.horizontal, 14)
    .padding(.vertical, 9)
  }

  private func openDashboard() {
    if case .success(let discovery) = BarDiscovery.load(), let url = discovery.resolvedURL {
      NSWorkspace.shared.open(url)
    }
  }
}

/// One account row: colored health dot, name, a chip subline, today's cost, and
/// a control menu.
struct BarRowView: View {
  let row: BarSummaryRow
  @ObservedObject var viewModel: BarViewModel

  var body: some View {
    HStack(alignment: .center, spacing: 9) {
      Circle()
        .fill(healthColor)
        .frame(width: 8, height: 8)

      VStack(alignment: .leading, spacing: 3) {
        HStack(spacing: 6) {
          Text(row.displayName ?? row.accountId)
            .font(.system(.body, design: .default).weight(.medium))
            .lineLimit(1)
            .truncationMode(.middle)
          if row.paused {
            Chip("paused", tint: .secondary)
          }
          if row.needsReauth {
            Chip("reauth", tint: .red)
          }
        }
        HStack(spacing: 6) {
          Chip(row.provider, tint: BarTheme.accent)
          if let tier = row.tier { Chip(tier, tint: .secondary) }
          Text(BarFormatting.quotaLabel(row.quotaPercentage))
            .font(.caption2)
            .foregroundStyle(.secondary)
        }
      }

      Spacer()

      let cost = BarFormatting.costLabel(row.todayCost)
      if !cost.isEmpty {
        Text(cost)
          .font(.system(.caption, design: .monospaced))
          .foregroundStyle(.secondary)
      }

      Menu {
        if row.paused {
          Button("Resume") { viewModel.resume(row) }
        } else {
          Button("Pause") { viewModel.pause(row) }
        }
        Button("Set as default") { viewModel.setDefault(row) }
        Button("Solo (pause others)") { viewModel.solo(row) }
        Divider()
        if let tier = row.tier {
          Button("Lock to \(tier)") { viewModel.tierLock(row, tier: tier) }
        }
        Button("Clear tier lock") { viewModel.tierLock(row, tier: nil) }
      } label: {
        Image(systemName: "ellipsis.circle")
      }
      .menuStyle(.borderlessButton)
      .menuIndicator(.hidden)
      .frame(width: 28)
    }
    .padding(.vertical, 5)
    .padding(.horizontal, 8)
    .background(Color.primary.opacity(0.035), in: RoundedRectangle(cornerRadius: 8))
  }

  private var healthColor: Color {
    switch row.health {
    case "error": return .red
    case "warning": return .orange
    default: return .green
    }
  }
}

/// Small pill label used in account sublines.
struct Chip: View {
  let text: String
  let tint: Color
  init(_ text: String, tint: Color) {
    self.text = text
    self.tint = tint
  }
  var body: some View {
    Text(text)
      .font(.system(size: 9, weight: .semibold))
      .padding(.horizontal, 5)
      .padding(.vertical, 1)
      .background(tint.opacity(0.16), in: Capsule())
      .foregroundStyle(tint == .secondary ? Color.secondary : tint)
  }
}
