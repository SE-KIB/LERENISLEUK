// swift-tools-version: 6.0
// ECO als echte iPhone-app (gebouwd met xtool, zie ios/LEESMIJ.md). De app opent sekibar.nl in een eigen venster,
// met de microfoon en camera vast toegestaan, zodat iOS niet bij elke sessie opnieuw vraagt.
import PackageDescription

let package = Package(
    name: "ECO",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "ECO", targets: ["ECO"]),
    ],
    targets: [
        .target(name: "ECO"),
    ],
    swiftLanguageModes: [.v5] // minder streng: waarschuwingen in plaats van bouwfouten
)
