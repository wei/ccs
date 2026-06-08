import SwiftUI
import CCSBarCore

/// Usage analytics block: spend rollups, a 7-day cost sparkline, and top models.
struct BarAnalyticsView: View {
  let analytics: BarAnalytics

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      SectionLabel("Usage")

      // Spend rollups, 2 x 2.
      VStack(spacing: 6) {
        HStack(spacing: 6) {
          StatCell(title: "Today", value: BarFormatting.money(analytics.today.cost))
          StatCell(title: "7 days", value: BarFormatting.money(analytics.last7d.cost))
        }
        HStack(spacing: 6) {
          StatCell(title: "30 days", value: BarFormatting.money(analytics.last30d.cost))
          StatCell(title: "All-time", value: BarFormatting.money(analytics.allTime.cost), accent: true)
        }
      }

      // 7-day sparkline.
      VStack(alignment: .leading, spacing: 5) {
        HStack {
          Text("Last 7 days").font(.caption2).foregroundStyle(.secondary)
          Spacer()
          Text("\(BarFormatting.count(analytics.last7d.requests)) req")
            .font(.caption2).foregroundStyle(.secondary)
        }
        Sparkline(values: analytics.byDay.map(\.cost)).frame(height: 30)
      }

      // Top models.
      if !analytics.topModels.isEmpty {
        let scope = analytics.topModelsWindow == "30d" ? "30d" : "all-time"
        SectionLabel("Top models · \(scope)")
        let peak = analytics.topModels.map(\.cost).max() ?? 1
        ForEach(analytics.topModels.prefix(4)) { model in
          ModelBar(model: model, peak: peak)
        }
      }
    }
  }
}

/// A small labelled stat tile.
private struct StatCell: View {
  let title: String
  let value: String
  var accent: Bool = false

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(title.uppercased())
        .font(.system(size: 9, weight: .semibold))
        .foregroundStyle(.secondary)
      Text(value)
        .font(.system(.callout, design: .rounded).weight(.semibold))
        .foregroundStyle(accent ? BarTheme.accent : .primary)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.vertical, 6)
    .padding(.horizontal, 9)
    .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 7))
  }
}

/// One top-model row: name + spend with a proportional accent bar behind.
private struct ModelBar: View {
  let model: BarAnalytics.Model
  let peak: Double

  var body: some View {
    GeometryReader { geo in
      let fraction = peak > 0 ? CGFloat(model.cost / peak) : 0
      ZStack(alignment: .leading) {
        RoundedRectangle(cornerRadius: 5)
          .fill(BarTheme.accent.opacity(0.16))
          .frame(width: max(8, geo.size.width * fraction))
        HStack {
          Text(model.model)
            .font(.caption)
            .lineLimit(1)
            .truncationMode(.middle)
          Spacer()
          Text(BarFormatting.money(model.cost))
            .font(.system(.caption, design: .monospaced))
            .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 8)
      }
    }
    .frame(height: 22)
  }
}

/// Uppercase section divider label.
struct SectionLabel: View {
  let text: String
  init(_ text: String) { self.text = text }
  var body: some View {
    Text(text.uppercased())
      .font(.system(size: 10, weight: .bold))
      .foregroundStyle(.secondary)
      .padding(.top, 2)
  }
}
