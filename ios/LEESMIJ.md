# ECO als echte iPhone-app (xtool)

Deze map is een kleine iPhone-app: hij opent sekibar.nl in een eigen venster. Verschil met de beginscherm-app:
- **microfoon en camera blijven toegestaan** (iOS vraagt één keer "Sta toe", daarna niet bij elke sessie opnieuw);
- ECO mag meteen praten (geen extra tik nodig voor geluid), ook met AirPods;
- links naar Spotify, WhatsApp en Kaarten openen in die apps; zonder internet probeert hij het na 5 seconden opnieuw.

Gebouwd met [xtool](https://github.com/xtool-org/xtool) (open source, MIT): bouwt, ondertekent en installeert iPhone-apps
vanaf Linux of **Windows (WSL)**, zonder Mac. Dat kan niet in de cloud: het vraagt jouw Apple ID, Xcode van Apple en je
iPhone aan de USB. Je doet het één keer op je laptop; daarna is bijwerken één commando.

## Eenmalig instellen (Windows-laptop)
1. **WSL** installeren (PowerShell als beheerder): `wsl --install -d Ubuntu`, daarna opnieuw opstarten.
2. **USB naar WSL** (voor de iPhone): installeer *usbipd-win* (`winget install usbipd`) en volg
   https://learn.microsoft.com/windows/wsl/connect-usb. Iphone aansluiten → in PowerShell (beheerder):
   `usbipd list` → `usbipd bind --busid <nummer>` → `usbipd attach --wsl --busid <nummer>`.
3. In **Ubuntu (WSL)**:
   - Swift 6.4 voor Linux: https://swift.org/install/linux (controle: `swift --version`).
   - `sudo apt-get install usbmuxd libimobiledevice-utils` (controle met iPhone aangesloten: `ideviceinfo`).
4. **Xcode 27.1** downloaden (alleen het bestand, je hebt geen Mac nodig): https://developer.apple.com/download/all/?q=Xcode
   → inloggen met je Apple ID → `Xcode_27.1.xip` opslaan (bv. in je Downloads; in WSL is dat `/mnt/c/Users/<naam>/Downloads`).
5. **xtool** installeren:
   ```
   curl -fL "https://github.com/xtool-org/xtool/releases/latest/download/xtool-$(uname -m).AppImage" -o xtool
   chmod +x xtool && sudo mv xtool /usr/local/bin/
   xtool setup
   ```
   Kies bij inloggen **1: Password** (werkt met elk gratis Apple ID; je wachtwoord gaat alleen naar Apple) en geef daarna
   het pad naar `Xcode_27.1.xip`. Controle: `swift sdk list` toont `darwin`.

## App op je iPhone zetten
```
git clone https://github.com/SE-KIB/LERENISLEUK && cd LERENISLEUK/ios
xtool dev
```
De eerste keer duurt het bouwen lang; daarna gaat het snel. Op de iPhone: **Vertrouw** deze computer (code invoeren), zet zo nodig
**Ontwikkelaarsmodus** aan (Instellingen → Privacy en beveiliging) en draai `xtool dev` nog een keer. Bij de eerste keer openen:
Instellingen → Algemeen → VPN en apparaatbeheer → je e-mailadres → **Vertrouw**.
Bijwerken later: `git pull` en weer `xtool dev`. (Meestal hoeft dat niet: de app laadt altijd de nieuwste sekibar.nl.)
Lukt de verbinding niet (`AFCClient.Error.muxError`)? Zie https://github.com/xtool-org/xtool/issues/19#issuecomment-2898986718.

## Goed om te weten
- **Gratis Apple ID:** Apple laat zulke apps na **7 dagen** verlopen (Apple's regel; de xtool-uitleg noemt het niet). Dan opent
  hij niet meer: sluit de iPhone aan en draai `xtool dev` opnieuw.
- **App Store** (zoals in de video): daarvoor is het betaalde Apple Developer Program nodig (€99 per jaar). Met dat lidmaatschap
  verloopt de app pas na een jaar, en kan hij via TestFlight of de App Store. Zeg het als je dat wilt, dan zet ik het klaar.
- De app vervangt de Scriptable-widget (nog) niet; die blijft gewoon werken. Een eigen widget in deze app kan later (xtool kan
  widgets bouwen), maar dan moet de app je inlog delen met de widget.
