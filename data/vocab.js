/* Kontrolliertes Vokabular für Filter und Merkmals-Abfrage.
   mode: "all" = alle Pflichtwerte wählen; "any" = mind. einen Pflichtwert wählen.
   In den Artdaten markiert "~" einen optionalen Wert (darf gewählt werden, muss aber nicht). */
window.VOCAB = {
  groups: [
    ["gestalt","Gestalt & Größe"], ["hut","Hut"], ["fs","Fruchtschicht (Lamellen, Röhren …)"], ["stiel","Stiel & Velum"], ["fleisch","Fleisch, Milch & Verfärbung"], ["geruch","Geruch & Geschmack"], ["sporen","Sporenpulver"], ["oeko","Vorkommen"], ["zeit","Saison"], ["wert","Speisewert & Schutz"]
  ],
  colors: {"weiss":"#f3efe6", "creme":"#ecdcb4", "gelb":"#e3bd3a", "ocker":"#c08a3c", "orange":"#e07b2a", "rot":"#c2352a", "rosa":"#e4a0a6", "violett":"#8456a6", "blau":"#4569ad", "gruen":"#55854a", "oliv":"#8b8743", "braun":"#7a5232", "rotbraun":"#8c3a22", "grau":"#8e8b86", "schwarz":"#2b2723"},
  cats: {
    fk: { l: "Fruchtkörperform", g: "gestalt", m: "all", o: [
      ["hut","Hut und Stiel"],["seit","seitlich gestielt / muschelförmig"],["kons","konsolenförmig (Porling-Typ)"],
      ["resu","resupinat / krustenförmig"],["keul","keulen- / zungenförmig"],["kora","korallenartig verzweigt"],
      ["kraus","krausenartig (Glucke)"],["bech","becher- / schüsselförmig"],["kugel","kugelig / birnförmig (Bauchpilz)"],
      ["stern","sternförmig aufreißend"],["phall","aus Hexenei"],["gall","gallertartig"],["morch","Morchel- / Lorchelform"],
      ["knol","unterirdisch knollig"],["strom","Stroma / Pusteln / Krusten"],["pflp","auf Pflanzen (Mehltau, Brand, Schorf)"],
      ["myxo","Schleimpilz"],["nest","Nestchen / Kügelchen"]] },
    hg: { l: "Größe (Hut bzw. Fruchtkörper)", g: "gestalt", m: "any", o: [
      ["k","klein (bis 3 cm)"],["m","mittel (3–8 cm)"],["g","groß (8–15 cm)"],["s","sehr groß (über 15 cm)"]] },
    hf: { l: "Hutfarbe", g: "hut", m: "any", color: true, o: "colors" },
    ho: { l: "Hutoberfläche", g: "hut", m: "all", o: [
      ["glatt","glatt"],["schmierig","schmierig / schleimig"],["trocken","trocken / matt"],["samtig","samtig / filzig"],
      ["faserig","eingewachsen faserig"],["schuppig","schuppig"],["flocken","Velumflocken / Hüllreste"],
      ["koernig","körnig / warzig"],["hygro","hygrophan"],["gerieft","Rand gerieft"],["bereift","bereift"],
      ["runzelig","runzelig"],["zoniert","gezont"],["rissig","rissig"],["glaenz","glänzend / lackartig"],
      ["haarig","behaart / striegelig"],["krust","krustig / hart"]] },
    hz: { l: "Hutform", g: "hut", m: "any", o: [
      ["halbk","halbkugelig / polsterförmig"],["gewoelbt","gewölbt"],["flach","flach"],["niederg","niedergedrückt"],
      ["trichter","trichterförmig"],["gebuckelt","gebuckelt"],["kegel","kegelig / glockig"],["genabelt","genabelt"],
      ["walze","eiförmig / walzenförmig"],["muschel","muschel- / zungenförmig"],["konsole","konsolen- / hufförmig"],
      ["lappig","unregelmäßig / lappig"]] },
    hy: { l: "Fruchtschicht: Typ", g: "fs", m: "all", o: [
      ["lam","Lamellen"],["leist","Leisten / Adern"],["roehr","Röhren (ablösbar)"],["por","Poren (fest verwachsen)"],
      ["lab","labyrinthisch / lamellig-porig"],["stach","Stacheln"],["glatt","glatt / runzelig"],
      ["wab","Waben / Gruben / Falten"],["gleba","Sporenmasse innen (Gleba)"],["peri","Perithezien (punktförmig eingesenkt)"],
      ["sonst","sonstige"]] },
    la: { l: "Lamellen: Ansatz am Stiel", g: "fs", m: "all", o: [
      ["frei","frei"],["ausgeb","ausgebuchtet"],["angew","angewachsen"],["herab","herablaufend"]] },
    lm: { l: "Fruchtschicht: Besonderheiten", g: "fs", m: "all", o: [
      ["dicht","dicht stehend"],["entfernt","entfernt stehend"],["gegabelt","gegabelt"],["splitternd","brüchig / splitternd"],
      ["wachsig","dick / wachsartig"],["schneide","Schneide andersfarbig"],["zerfl","zerfließend"],
      ["fleckig","gefleckt / marmoriert"],["abloes","leicht ablösbar"],["kollar","Kollar"],["querad","queradrig / Anastomosen"],
      ["poreng","Poren fein / eng"],["porweit","Poren weit / eckig"],["tropfen","Tropfen (Guttation)"]] },
    lf: { l: "Fruchtschicht: Farbe", g: "fs", m: "any", color: true, o: "colors" },
    ve: { l: "Velum / Hüllreste", g: "stiel", m: "all", o: [
      ["kein","keine Hüllreste"],["ring","häutiger Ring"],["ringz","Ringzone / vergänglicher Ring"],
      ["cortina","Cortina (Spinnwebschleier)"],["volva","häutige Volva (Scheide)"],["knolle","Knolle (gerandet / mit Gürteln)"],
      ["flocken","Velumreste auf dem Hut"],["schleim","schleimiges Velum"],["guertel","Velumgürtel am Stiel"]] },
    st: { l: "Stiel: Oberfläche / Bekleidung", g: "stiel", m: "all", o: [
      ["netz","Netz"],["flocken","Flöckchen / beflockt"],["raufuss","Schüppchen / Raufuß"],["genattert","genattert"],
      ["faserig","längsfaserig"],["samtig","samtig / filzig"],["wurzel","wurzelnd"],["hohl","hohl"],
      ["knorpel","knorpelig / zäh"],["punkt","punktiert / körnig"],["bereift","bereift"],["schleimig","schleimig"],
      ["exzentr","exzentrisch / seitlich"],["kurz","kurz / gedrungen oder fehlend"],["basisfilz","Basis filzig"],
      ["keulig","Basis keulig / knollig"]] },
    sf: { l: "Stiel: Grundfarbe", g: "stiel", m: "any", color: true, o: "colors" },
    nf: { l: "Stiel: Farbe der Bekleidung", g: "stiel", m: "any", color: true, o: "colors" },
    fv: { l: "Verfärbung bei Verletzung (Schnitt / Druck)", g: "fleisch", m: "all", o: [
      ["unver","keine Verfärbung (unveränderlich)"],["blau","blauend"],["rot","rötend"],["gelb","gilbend"],["braun","bräunend"],
      ["schwarz","schwärzend"],["grau","grauend"],["gruen","grünend"],["lila","violett verfärbend"]] },
    mi: { l: "Milch / Saft (beim Anschneiden)", g: "fleisch", m: "all", o: [
      ["kein","keine Milch, kein Saft"],["milchw","Milch weiß, unveränderlich"],["milchg","Milch weiß → gelb"],
      ["milchb","Milch weiß → bräunend"],["milchv","Milch weiß → violett"],["milcho","Milch orange / karottenrot"],
      ["saftk","Milch / Saft wasserklar"],["saftr","roter Saft / rote Milch"]] },
    ko: { l: "Konsistenz des Fleisches", g: "fleisch", m: "all", o: [
      ["weich","fleischig (weich bis fest)"],["bruechig","brüchig / kreidig"],["faserig","faserig / zäh"],["korkig","korkig"],
      ["holzig","holzig-hart"],["ledrig","ledrig"],["gallertig","gallertig"],["wachsig","wachsartig"],
      ["staub","stäubend (reif)"]] },
    ge: { l: "Geruch", g: "geruch", m: "all", o: [
      ["unauff","unauffällig"],["mehl","Mehl / Gurke"],["anis","Anis / Fenchel"],["rettich","Rettich"],["knobl","Knoblauch"],
      ["kartoffel","rohe Kartoffel"],["erde","erdig / Rübe"],["gas","Leuchtgas"],["karbol","Karbol / Tinte"],
      ["aas","Aas / Jauche"],["frucht","fruchtig"],["honig","Honig / süßlich"],["mandel","Bittermandel / Marzipan"],
      ["fisch","Fisch / Hering"],["maggi","Maggi / Liebstöckel"],["harz","Harz / Terpentin / Zedernholz"],["chlor","Chlor / Jod"],
      ["pelarg","Pelargonie"],["kohl","Kohl / faulig"],["bock","Ziegenbock / Kampfer"],["maus","Mäuseharn"],
      ["wuerzig","würzig / pilzartig"],["wanze","Wanzen / ölig"]] },
    gs: { l: "Geschmack", g: "geruch", m: "all", o: [
      ["mild","mild"],["scharf","scharf"],["bitter","bitter"],["mehl","mehlig"],["herb","herb / adstringierend"],
      ["nuss","nussig"]] },
    sp: { l: "Sporenpulver", g: "sporen", m: "all", o: [
      ["weiss","weiß"],["creme","creme / blassocker"],["ocker","ocker / gelb"],["rosa","rosa / fleischrosa"],
      ["rost","rost- / zimtbraun"],["ton","ton- / graubraun"],["oliv","olivbraun"],["purpur","purpur- / schokobraun"],
      ["schwarz","schwarz"]] },
    er: { l: "Ernährungsweise", g: "oeko", m: "all", o: [
      ["myk","Mykorrhiza"],["sap","Saprobiont (Zersetzer)"],["par","Parasit"],["flechte","Flechte (Symbiose mit Algen)"]] },
    su: { l: "Substrat", g: "oeko", m: "all", o: [
      ["boden","Erdboden"],["streu","Laub- / Nadelstreu"],["laubh","totes Laubholz"],["nadelh","totes Nadelholz"],
      ["lebb","lebende Bäume"],["stamm","Stammbasis / Wurzeln"],["zapfen","Zapfen"],["dung","Dung"],["brand","Brandstellen"],
      ["moos","Moos"],["pilze","auf Pilzen"],["insekt","Insekten / Larven"],["pflanze","lebende Pflanzen"],
      ["frucht","Früchte / Samen"],["reste","Pflanzenreste / Stängel"],["mulch","Holzhäcksel / Mulch"]] },
    pa: { l: "Partner- bzw. Wirtsbaum", g: "oeko", m: "any", o: [
      ["fichte","Fichte"],["kiefer","Kiefer"],["laerche","Lärche"],["tanne","Tanne"],["douglasie","Douglasie"],
      ["nadel","Nadelbäume allg."],["buche","Buche"],["eiche","Eiche"],["birke","Birke"],["pappel","Pappel / Espe"],
      ["hainbuche","Hainbuche"],["hasel","Hasel"],["erle","Erle"],["linde","Linde"],["weide","Weide"],["esche","Esche"],
      ["ahorn","Ahorn"],["kastanie","Edelkastanie"],["ulme","Ulme"],["obst","Obstbäume"],["laub","Laubbäume allg."]] },
    hb: { l: "Lebensraum", g: "oeko", m: "any", o: [
      ["laubw","Laubwald"],["nadelw","Nadelwald"],["mischw","Mischwald"],["wiese","Wiese / Weide"],["mager","Magerrasen"],
      ["park","Park / Garten"],["moor","Moor / Sumpf"],["au","Auwald"],["heide","Heide"],["weg","Wegrand"],
      ["sand","Sand / Dünen"],["salz","Salzwiese / Küste"],["kompost","Kompost / Gewächshaus"],["gebirge","Bergwald / Gebirge"],
      ["acker","Feld / Acker"],["stadt","Stadt / Straßenrand"]] },
    bo: { l: "Boden", g: "oeko", m: "any", o: [
      ["sauer","sauer"],["kalk","kalkhaltig / basisch"],["neutral","neutral / indifferent"],["naehr","nährstoffreich"],
      ["mager","nährstoffarm"]] },
    sz: { l: "Jahreszeit", g: "zeit", m: "all", o: [
      ["fr","Frühling"],["so","Sommer"],["he","Herbst"],["wi","Winter"],["ganz","ganzjährig"]] },
    sw: { l: "Speisewert", g: "wert", m: "any", o: [
      ["e","essbar"],["eg","essbar mit Einschränkung"],["un","uneinheitlich beurteilt"],["k","kein Speisepilz / ungenießbar"],
      ["g","giftig"],["t","tödlich giftig"]] },
    vt: { l: "Verträglichkeit / Hinweise", g: "wert", m: "all", o: [
      ["roh","roh giftig – nur gut gegart"],["alk","mit Alkohol giftig"],["indiv","nur für manche Menschen unverträglich"],
      ["menge","größere Mengen unverträglich"],["jung","nur jung verwendbar"],["zub","nur nach besonderer Zubereitung"],
      ["schad","Schadstoffe / Krebsverdacht"],["unklar","Giftwirkung unklar / giftverdächtig"]] },
    sy: { l: "Vergiftungssyndrom", g: "wert", m: "all", o: [
      ["phal","Phalloides-Syndrom (Amatoxine – Leberversagen)"],["orel","Orellanus-Syndrom (Orellanin – Nierenversagen)"],
      ["gyro","Gyromitra-Syndrom (Gyromitrin – Leber, Nerven)"],
      ["panth","Pantherina-Syndrom (Ibotensäure – Rausch, Verwirrtheit)"],["musc","Muscarin-Syndrom (Schweiß-, Speichelfluss)"],
      ["psilo","Psilocybin-Syndrom (Halluzinationen)"],["copr","Coprinus-Syndrom (nur mit Alkohol)"],
      ["paxi","Paxillus-Syndrom (Immunhämolyse)"],["rhabd","Rhabdomyolyse (Muskelzerfall)"],
      ["gastro","Magen-Darm-Syndrom (gastrointestinal)"],["haemo","Hämolyse (roh giftig)"],
      ["acro","Acromelalgie (Brennschmerz in Händen/Füßen)"],["enzeph","Pleurocybella-Syndrom (Gehirnschädigung)"],
      ["morch","Morchella-Syndrom (Schwindel, Gangunsicherheit)"],["polyp","Polyporsäure-Syndrom (Niere, violetter Urin)"],
      ["ergot","Ergotismus (Mutterkorn)"],["prox","Proxima-Syndrom (Nierenversagen, meist reversibel)"],
      ["omph","Omphalotus-Syndrom (heftiges Erbrechen)"],["scler","Scleroderma-Syndrom (Magen-Darm, Kreislauf)"]] },
    ss: { l: "Schutzstatus (BArtSchV)", g: "wert", m: "all", o: [
      ["no","nicht geschützt"],["bes","besonders geschützt – Sammelverbot"],
      ["ausn","besonders geschützt – geringe Mengen für den Eigenbedarf erlaubt"]] }
  },
  combos: [{"key":"stielm","l":"Stielmerkmale","parts":["sf","st","nf"],"sub":{"sf":"Grundfarbe des Stiels","st":"Oberfläche / Bekleidung (Netz, Flocken, Schüppchen, Natterung …)","nf":"Farbe der Bekleidung"}}],
  core: ["fk","hy","la","hf","ve","st","sf","nf","fv","mi","ge","sp","er","pa","sw","sy"],
  sw: {"e":["essbar","ok"],"eg":["essbar mit Einschränkung","warn"],"un":["uneinheitlich beurteilt","warn"],"k":["kein Speisepilz","neutral"],"g":["giftig","bad"],"t":["tödlich giftig","deadly"]},
  lv: {"1":"FM1","2":"FM2","P":"PSV"},
  cls: {"B":"Ständerpilze (Basidiomycota)","A":"Schlauchpilze (Ascomycota)","M":"Schleimpilze (Myxomycota)","L":"Flechten","O":"Sonstige"},
  qtopics: [["morph","Morphologie & Begriffe"],["art","Artmerkmale"],["unters","Unterscheidung"],["gatt","Gattungen"],["sporen","Sporenpulver"],["oeko","Ökologie & Bäume"],["speise","Speisewert & Beratung"],["recht","Recht & Naturschutz"],["tox","Toxikologie"],["syst","Systematik"],["praxis","PSV-Praxis"]]
};
