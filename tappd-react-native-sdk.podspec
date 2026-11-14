# DRAFT: not yet built. Lets React Native autolink the iOS Live Activities module.
require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "tappd-react-native-sdk"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://tappd.io"
  s.license      = package["license"]
  s.authors      = { "Tappd" => "support@tappd.io" }
  s.platforms    = { :ios => "13.4" }
  s.source       = { :git => package["repository"]["url"], :tag => s.version.to_s }
  s.source_files = "ios/**/*.{h,m,swift}"
  s.swift_version = "5.9"
  s.dependency "React-Core"
end
