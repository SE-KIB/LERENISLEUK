// Plak dit in een nieuw script in Scriptable en tik op ▶. Het haalt de ECO-widget op (en werkt hem later bij als je het opnieuw draait).
const code = await new Request("https://sekibar.nl/widget/eco-widget.js").loadString();
let fm;
try { fm = FileManager.iCloud(); fm.documentsDirectory(); } catch { fm = FileManager.local(); }
fm.writeString(fm.joinPath(fm.documentsDirectory(), "ECO.js"), code);
const a = new Alert();
a.title = "ECO-widget geïnstalleerd";
a.message = "Open nu het script 'ECO' en log in met je ECO-account. Voeg daarna een Scriptable-widget toe en kies bij Script: ECO.";
a.addAction("OK");
await a.present();
Script.complete();
