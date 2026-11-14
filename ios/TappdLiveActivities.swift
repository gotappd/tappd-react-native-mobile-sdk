// DRAFT: written without Xcode and not yet compiled or run. Build and test on a Mac before
// releasing. See README → "Live Activities".
//
// Watches ActivityKit for the tokens Tappd needs and hands them to the React Native layer:
//   - push-to-start tokens (iOS 17.2+), so your server can start activities through Tappd
//   - each running activity's update token, so it can update and end them
//   - activities ending on the device
//
// Register each ActivityAttributes type once at launch (AppDelegate), telling Tappd which
// attribute holds your key for the activity (e.g. an order id):
//
//   if #available(iOS 17.2, *) {
//     TappdLiveActivities.observe(DeliveryAttributes.self) { $0.orderId }
//   }

import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

public enum TappdLiveActivities {
  /// Set to .sandbox in debug builds run from Xcode (their APNs tokens only work in sandbox).
  public static var environment: Environment = {
    #if DEBUG
    return .sandbox
    #else
    return .production
    #endif
  }()

  public enum Environment: String {
    case production
    case sandbox
  }

  static func hex(_ data: Data) -> String {
    data.map { String(format: "%02x", $0) }.joined()
  }

  #if canImport(ActivityKit)
  /// Starts watching one ActivityAttributes type. Call once per type, early in launch.
  /// - Parameter activityKey: returns your key for an activity from its attributes; the
  ///   server uses the same key in update and end calls.
  @available(iOS 17.2, *)
  public static func observe<A: ActivityAttributes>(_ type: A.Type, activityKey: @escaping (A) -> String) {
    let activityType = String(describing: A.self)

    // Push-to-start token for this type (rotates; each new one replaces the last).
    Task {
      for await data in Activity<A>.pushToStartTokenUpdates {
        TappdLiveActivitiesModule.emit(event: .token, body: [
          "kind": "push_to_start",
          "activityType": activityType,
          "token": hex(data),
          "environment": environment.rawValue,
        ])
      }
    }

    // Activities already running when the app launches, then ones started later (including
    // ones Tappd started with a push).
    for activity in Activity<A>.activities {
      watch(activity, activityType: activityType, key: activityKey(activity.attributes))
    }
    Task {
      for await activity in Activity<A>.activityUpdates {
        watch(activity, activityType: activityType, key: activityKey(activity.attributes))
      }
    }
  }

  @available(iOS 16.2, *)
  private static func watch<A: ActivityAttributes>(_ activity: Activity<A>, activityType: String, key: String) {
    Task {
      for await data in activity.pushTokenUpdates {
        TappdLiveActivitiesModule.emit(event: .token, body: [
          "kind": "update",
          "activityType": activityType,
          "token": hex(data),
          "activityKey": key,
          "activityId": activity.id,
          "environment": environment.rawValue,
        ])
      }
    }
    Task {
      for await state in activity.activityStateUpdates {
        if state == .ended || state == .dismissed {
          TappdLiveActivitiesModule.emit(event: .ended, body: ["activityId": activity.id, "activityKey": key])
          break
        }
      }
    }
  }
  #endif
}
