// ECO voor de iPhone: sekibar.nl in een eigen app.
// Waarom niet gewoon de beginscherm-app (PWA)? Die vraagt in iOS steeds opnieuw om de microfoon en stopt geluid sneller.
// Deze app geeft sekibar.nl de microfoon en camera vast (na één keer "Sta toe" in iOS) en houdt geluid aan.
// Links naar andere apps (Spotify, WhatsApp, Kaarten) en nieuwe vensters gaan naar die app of naar Safari.
import AVFoundation
import SwiftUI
import UIKit
import WebKit

let ecoAdres = URL(string: "https://sekibar.nl/")!
@MainActor let ecoAchtergrond = UIColor(red: 1 / 255, green: 7 / 255, blue: 12 / 255, alpha: 1) // #01070c, zoals de site

@main
struct ECOApp: App {
    init() {
        // Praten en luisteren tegelijk, via de luidspreker of AirPods.
        try? AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .default,
                                                         options: [.defaultToSpeaker, .allowBluetoothA2DP, .mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    var body: some Scene {
        WindowGroup {
            ECOWeb()
                .background(Color(red: 1 / 255, green: 7 / 255, blue: 12 / 255).ignoresSafeArea())
                .preferredColorScheme(.dark)
        }
    }
}

struct ECOWeb: UIViewRepresentable {
    func makeCoordinator() -> Gids { Gids() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = [] // ECO mag meteen praten
        config.websiteDataStore = .default()                  // ingelogd blijven
        config.applicationNameForUserAgent = "ECO-iOS/1.0"
        let web = WKWebView(frame: .zero, configuration: config)
        web.uiDelegate = context.coordinator
        web.navigationDelegate = context.coordinator
        web.isOpaque = false
        web.backgroundColor = ecoAchtergrond
        web.scrollView.backgroundColor = ecoAchtergrond
        web.allowsBackForwardNavigationGestures = false
        web.load(URLRequest(url: ecoAdres))
        context.coordinator.web = web
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {}
}

@MainActor
final class Gids: NSObject, WKUIDelegate, WKNavigationDelegate {
    weak var web: WKWebView?

    private func isEco(_ host: String?) -> Bool {
        guard let host else { return false }
        return host == "sekibar.nl" || host.hasSuffix(".sekibar.nl")
    }

    // Microfoon en camera: voor sekibar.nl altijd (iOS vraagt zelf één keer), voor andere sites zoals gewoonlijk.
    func webView(_ webView: WKWebView, decideMediaCapturePermissionsFor origin: WKSecurityOrigin,
                 initiatedBy frame: WKFrameInfo, type: WKMediaCaptureType) async -> WKPermissionDecision {
        isEco(origin.host) ? .grant : .prompt
    }

    // Andere apps (spotify:, whatsapp:, tel:, maps) openen buiten ECO; gewone webpagina's (ook het inloggen) blijven hier.
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = navigationAction.request.url, let scheme = url.scheme?.lowercased() else { return .allow }
        if ["http", "https", "about", "blob", "data"].contains(scheme) {
            if navigationAction.targetFrame == nil { // target=_blank
                _ = await UIApplication.shared.open(url)
                return .cancel
            }
            if let host = url.host, ["open.spotify.com", "wa.me", "api.whatsapp.com", "maps.apple.com"].contains(host) {
                _ = await UIApplication.shared.open(url)
                return .cancel
            }
            return .allow
        }
        _ = await UIApplication.shared.open(url)
        return .cancel
    }

    // window.open(): in Safari of de bijbehorende app.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { UIApplication.shared.open(url) }
        return nil
    }

    // Geen internet of de site hapert: na 5 seconden opnieuw proberen. Alleen bij echte netwerkfouten, niet als een
    // link hierboven bewust naar een andere app ging (dan is het laden "afgebroken").
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let fout = error as NSError
        let netwerk: Set<Int> = [NSURLErrorNotConnectedToInternet, NSURLErrorTimedOut, NSURLErrorCannotFindHost,
                                 NSURLErrorCannotConnectToHost, NSURLErrorNetworkConnectionLost, NSURLErrorDNSLookupFailed]
        guard fout.domain == NSURLErrorDomain, netwerk.contains(fout.code) else { return }
        Task { @MainActor [weak webView] in
            try? await Task.sleep(for: .seconds(5))
            webView?.load(URLRequest(url: ecoAdres))
        }
    }

    // iOS sloot de webinhoud af (bv. weinig geheugen): opnieuw laden in plaats van een wit scherm.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.load(URLRequest(url: ecoAdres))
    }
}
