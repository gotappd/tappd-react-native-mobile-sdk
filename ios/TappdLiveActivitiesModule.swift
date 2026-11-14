// DRAFT: written without Xcode and not yet compiled or run. Build and test on a Mac first.
//
// React Native event emitter for TappdLiveActivities. Events raised before JavaScript starts
// listening are queued and delivered once it does (tokens often arrive at launch).

import Foundation
import React

@objc(TappdLiveActivities)
final class TappdLiveActivitiesModule: RCTEventEmitter {
  enum Event: String, CaseIterable {
    case token = "TappdLiveActivityToken"
    case ended = "TappdLiveActivityEnded"
  }

  private static let lock = NSLock()
  private static weak var shared: TappdLiveActivitiesModule?
  private static var queued: [(Event, [String: Any])] = []
  private var hasListeners = false

  override init() {
    super.init()
    TappdLiveActivitiesModule.lock.lock()
    TappdLiveActivitiesModule.shared = self
    TappdLiveActivitiesModule.lock.unlock()
  }

  override static func requiresMainQueueSetup() -> Bool { false }

  override func supportedEvents() -> [String]! { Event.allCases.map { $0.rawValue } }

  override func startObserving() {
    TappdLiveActivitiesModule.lock.lock()
    hasListeners = true
    let pending = TappdLiveActivitiesModule.queued
    TappdLiveActivitiesModule.queued.removeAll()
    TappdLiveActivitiesModule.lock.unlock()
    for (event, body) in pending { sendEvent(withName: event.rawValue, body: body) }
  }

  override func stopObserving() {
    TappdLiveActivitiesModule.lock.lock()
    hasListeners = false
    TappdLiveActivitiesModule.lock.unlock()
  }

  static func emit(event: Event, body: [String: Any]) {
    lock.lock()
    guard let module = shared, module.hasListeners else {
      queued.append((event, body))
      if queued.count > 100 { queued.removeFirst(queued.count - 100) }
      lock.unlock()
      return
    }
    lock.unlock()
    module.sendEvent(withName: event.rawValue, body: body)
  }
}
