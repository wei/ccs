import Foundation

/// Usage analytics for the menu bar, mirroring `GET /api/bar/analytics`.
///
/// Rolled up server-side from the persisted CLIProxy usage snapshot. All cost
/// values are USD.
public struct BarAnalytics: Codable, Sendable, Equatable {
  public struct Window: Codable, Sendable, Equatable {
    public let cost: Double
    public let requests: Int
    public init(cost: Double, requests: Int) {
      self.cost = cost
      self.requests = requests
    }
  }

  public struct Day: Codable, Sendable, Equatable, Identifiable {
    public let date: String
    public let cost: Double
    public let requests: Int
    public var id: String { date }
    public init(date: String, cost: Double, requests: Int) {
      self.date = date
      self.cost = cost
      self.requests = requests
    }
  }

  public struct Model: Codable, Sendable, Equatable, Identifiable {
    public let model: String
    public let cost: Double
    public let requests: Int
    public var id: String { model }
    public init(model: String, cost: Double, requests: Int) {
      self.model = model
      self.cost = cost
      self.requests = requests
    }
  }

  public let today: Window
  public let last7d: Window
  public let last30d: Window
  public let allTime: Window
  public let byDay: [Day]
  public let topModels: [Model]
  /// "30d" when recent data exists, else "all".
  public let topModelsWindow: String
  public let generatedAt: String

  public init(
    today: Window,
    last7d: Window,
    last30d: Window,
    allTime: Window,
    byDay: [Day],
    topModels: [Model],
    topModelsWindow: String,
    generatedAt: String
  ) {
    self.today = today
    self.last7d = last7d
    self.last30d = last30d
    self.allTime = allTime
    self.byDay = byDay
    self.topModels = topModels
    self.topModelsWindow = topModelsWindow
    self.generatedAt = generatedAt
  }
}
