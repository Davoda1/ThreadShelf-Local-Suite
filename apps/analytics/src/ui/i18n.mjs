// Complete Analytics dictionaries. Source titles, identifiers and approved theme
// names stay original. Locale data never comes from Reader preferences.
const rows = `
overview|Overview|Áttekintés|Übersicht|Vue d’ensemble|概要
activity|Activity & time|Aktivitás és idő|Aktivität und Zeit|Activité et temps|活動と時間
models|Models & platforms|Modellek és platformok|Modelle und Plattformen|Modèles et plateformes|モデルとプラットフォーム
content|Content & code|Tartalom és kód|Inhalt und Code|Contenu et code|内容とコード
structure|Conversations & structure|Beszélgetések és szerkezet|Gespräche und Struktur|Conversations et structure|会話と構造
tools|Tools & recorded usage|Eszközök és rögzített használat|Werkzeuge und erfasste Nutzung|Outils et utilisation enregistrée|ツールと記録済み使用量
quality|Data quality|Adatminőség|Datenqualität|Qualité des données|データ品質
settings|Sources & settings|Források és beállítások|Quellen und Einstellungen|Sources et réglages|ソースと設定
overviewHelp|Understand your archived conversations with traceable, compatible measures.|Archivált beszélgetések elemzése követhető, összevethető mérőszámokkal.|Archivierte Gespräche mit nachvollziehbaren, vergleichbaren Messgrößen verstehen.|Comprenez vos conversations archivées avec des mesures traçables et comparables.|追跡可能で比較可能な指標でアーカイブを分析します。
activityHelp|Original timestamps, explicit timezones, and visible missing-date coverage.|Eredeti időbélyegek, egyértelmű időzónák és a hiányzó dátumok lefedettsége.|Originale Zeitstempel, explizite Zeitzonen und sichtbare Datumsabdeckung.|Horodatages d’origine, fuseaux explicites et couverture des dates.|元の日時、明示的なタイムゾーン、欠落日時の網羅率。
modelsHelp|Platform and model are separate. Message filters preserve model changes.|A platform és modell külön fogalom. Az üzenetszűrő megőrzi a modellváltásokat.|Plattform und Modell sind getrennt. Nachrichtenfilter erhalten Modellwechsel.|La plateforme et le modèle sont distincts. Les filtres conservent les changements.|プラットフォームとモデルを区別し、モデルの変更を保持します。
contentHelp|Observed text, declared code languages, references, and attachment coverage.|Megfigyelt szöveg, megadott kódnyelvek, hivatkozások és mellékletlefedettség.|Beobachteter Text, deklarierte Codesprachen, Verweise und Anhänge.|Texte observé, langages de code déclarés, références et pièces jointes.|観測されたテキスト、宣言されたコード言語、参照、添付ファイル。
structureHelp|Selected paths, retained branches, versions, and explicit identities.|Kiválasztott útvonalak, megőrzött ágak, verziók és egyértelmű azonosítók.|Ausgewählte Pfade, erhaltene Zweige, Versionen und explizite Identitäten.|Parcours choisis, branches conservées, versions et identités explicites.|選択された経路、保持された分岐、版、明示的な識別子。
toolsHelp|Recorded calls and usage remain separate from indicators and context occupancy.|A rögzített hívás és használat különbözik a jelzésektől és kontextusmérettől.|Erfasste Aufrufe und Nutzung sind von Hinweisen und Kontextbelegung getrennt.|Les appels et l’utilisation sont distincts des indicateurs et du contexte.|記録済み呼び出しと使用量を指標やコンテキスト使用率と区別します。
qualityHelp|Inspect capabilities, unknown fields, diagnostics, and snapshot provenance.|Képességek, ismeretlen mezők, diagnosztika és pillanatképeredet ellenőrzése.|Fähigkeiten, unbekannte Felder, Diagnosen und Snapshot-Herkunft prüfen.|Examinez les capacités, champs inconnus, diagnostics et provenance.|機能、未知のフィールド、診断、スナップショットの来歴を確認します。
settingsHelp|Analytics owns its settings and data. Sources remain read-only.|Az Analytics saját beállításokat és adatokat kezel. A források csak olvashatók.|Analytics verwaltet eigene Einstellungen und Daten. Quellen bleiben schreibgeschützt.|Analytics possède ses réglages et données. Les sources restent en lecture seule.|設定とデータは Analytics 独自に管理し、ソースは読み取り専用です。
offline|Offline|Offline|Offline|Hors ligne|オフライン
private|Private, local analysis|Privát, helyi elemzés|Private lokale Analyse|Analyse locale privée|非公開のローカル分析
synthetic|Synthetic preview|Szintetikus előnézet|Synthetische Vorschau|Aperçu synthétique|合成データのプレビュー
addSource|Add source|Forrás hozzáadása|Quelle hinzufügen|Ajouter une source|ソースを追加
discoverReader|Find Reader archive|Reader-archívum keresése|Reader-Archiv finden|Trouver l’archive Reader|Reader アーカイブを検索
readerDiscovery|Reader archive detection|Reader-archívum felismerése|Reader-Archiverkennung|Détection de l’archive Reader|Reader アーカイブの検出
readerDiscoveryHelp|The standard Reader profile is checked automatically. You can also choose another archive or export.|A szokásos Reader-profilt automatikusan ellenőrzi. Másik archívum vagy export is választható.|Das Standardprofil von Reader wird automatisch geprüft. Andere Archive oder Exporte können ebenfalls gewählt werden.|Le profil Reader standard est vérifié automatiquement. Vous pouvez aussi choisir une autre archive ou un export.|標準の Reader プロファイルを自動で確認します。別のアーカイブやエクスポートも選択できます。
readerNotStarted|Waiting to check the standard Reader profile.|A szokásos Reader-profil ellenőrzésére vár.|Warten auf die Prüfung des Standardprofils.|En attente de la vérification du profil Reader standard.|標準の Reader プロファイルの確認を待機しています。
readerChecking|Checking the standard Reader profile…|A szokásos Reader-profil ellenőrzése…|Standardprofil wird geprüft…|Vérification du profil Reader standard…|標準の Reader プロファイルを確認中…
readerAbsent|No Reader archive found at the standard location.|Nem található Reader-archívum a szokásos helyen.|Am Standardort wurde kein Reader-Archiv gefunden.|Aucune archive Reader trouvée à l’emplacement standard.|標準の場所に Reader アーカイブが見つかりません。
readerAvailable|Reader archive found.|Reader-archívum megtalálva.|Reader-Archiv gefunden.|Archive Reader trouvée.|Reader アーカイブが見つかりました。
readerRegistered|Reader archive connected.|Reader-archívum csatlakoztatva.|Reader-Archiv verbunden.|Archive Reader connectée.|Reader アーカイブを接続しました。
readerSuppressed|Previously removed Reader source. Use Find Reader archive to reconnect.|Korábban eltávolított Reader-forrás. Az újracsatlakoztatáshoz válassza a keresést.|Zuvor entfernte Reader-Quelle. Zum erneuten Verbinden „Reader-Archiv finden“ wählen.|Source Reader précédemment retirée. Utilisez la recherche pour la reconnecter.|以前削除した Reader ソースです。再接続するには検索してください。
readerBusy|Another capture is running. Try finding Reader again after it finishes.|Másik rögzítés fut. Utána próbálja újra a Reader keresését.|Eine andere Erfassung läuft. Danach die Reader-Suche erneut versuchen.|Une autre capture est en cours. Relancez la recherche ensuite.|別の取り込みが実行中です。完了後に再検索してください。
readerInvalid|The standard location does not contain a valid Reader archive.|A szokásos hely nem tartalmaz érvényes Reader-archívumot.|Der Standardort enthält kein gültiges Reader-Archiv.|L’emplacement standard ne contient pas d’archive Reader valide.|標準の場所に有効な Reader アーカイブがありません。
readerUnsafe|Reader detection was blocked by source-access safeguards.|A forráshozzáférési védelem megakadályozta a Reader felismerését.|Die Reader-Erkennung wurde durch Zugriffsschutz blockiert.|La détection Reader a été bloquée par les protections d’accès.|ソースアクセス保護により Reader の検出が停止しました。
readerUnavailable|The standard Reader archive is unavailable or inaccessible.|A szokásos Reader-archívum nem elérhető vagy nem hozzáférhető.|Das Standardarchiv ist nicht verfügbar oder zugänglich.|L’archive Reader standard est indisponible ou inaccessible.|標準の Reader アーカイブを利用または読み取りできません。
readerUnsupported|The detected Reader archive format is unsupported.|A felismert Reader-archívum formátuma nem támogatott.|Das erkannte Reader-Archivformat wird nicht unterstützt.|Le format de l’archive Reader détectée n’est pas pris en charge.|検出した Reader アーカイブ形式には対応していません。
refresh|Refresh|Frissítés|Aktualisieren|Actualiser|更新
cancel|Cancel|Mégse|Abbrechen|Annuler|キャンセル
close|Close|Bezárás|Schließen|Fermer|閉じる
save|Save|Mentés|Speichern|Enregistrer|保存
apply|Apply filters|Szűrők alkalmazása|Filter anwenden|Appliquer les filtres|フィルターを適用
reset|Reset|Alaphelyzet|Zurücksetzen|Réinitialiser|リセット
filters|Filters|Szűrők|Filter|Filtres|フィルター
advancedFilters|All filters|Minden szűrő|Alle Filter|Tous les filtres|すべてのフィルター
appliedFilters|Applied filters|Alkalmazott szűrők|Angewandte Filter|Filtres appliqués|適用済みフィルター
compare|Compare|Összehasonlítás|Vergleichen|Comparer|比較
export|Export report|Jelentés exportálása|Bericht exportieren|Exporter le rapport|レポートをエクスポート
saveView|Save view|Nézet mentése|Ansicht speichern|Enregistrer la vue|ビューを保存
savedViews|Saved views|Mentett nézetek|Gespeicherte Ansichten|Vues enregistrées|保存済みビュー
viewName|View name|Nézet neve|Name der Ansicht|Nom de la vue|ビュー名
remove|Remove|Eltávolítás|Entfernen|Supprimer|削除
delete|Delete|Törlés|Löschen|Supprimer|削除
all|All|Mind|Alle|Tous|すべて
allTime|All time|Teljes időszak|Gesamter Zeitraum|Toute la période|全期間
last7|Last 7 days|Elmúlt 7 nap|Letzte 7 Tage|7 derniers jours|過去7日
last30|Last 30 days|Elmúlt 30 nap|Letzte 30 Tage|30 derniers jours|過去30日
calendarYear|Calendar year|Naptári év|Kalenderjahr|Année civile|暦年
calendarYearSelect|Displayed year|Megjelenített év|Angezeigtes Jahr|Année affichée|表示する年
calendarOutsideRange|Outside the applied date range|Az alkalmazott dátumtartományon kívül|Außerhalb des angewendeten Datumsbereichs|Hors de la période appliquée|適用した日付範囲外
calendarLess|Less|Kevesebb|Weniger|Moins|少ない
calendarMore|More|Több|Mehr|Plus|多い
calendarHelp|One cell per day for the whole year. Counts follow the applied filters.|A teljes év minden napjához egy cella tartozik. A számok az alkalmazott szűrőket követik.|Eine Zelle pro Tag für das ganze Jahr. Die Werte folgen den angewendeten Filtern.|Une cellule par jour sur toute l’année. Les nombres suivent les filtres appliqués.|一年の各日に一つのセルを表示します。件数には適用したフィルターが反映されます。
calendarKeyboardHelp|Use arrow keys to move between days; Enter opens evidence.|A nyílbillentyűkkel léphet a napok között; az Enter megnyitja a bizonyítékokat.|Mit den Pfeiltasten zwischen Tagen wechseln; Eingabe öffnet Belege.|Utilisez les flèches pour parcourir les jours ; Entrée ouvre les éléments associés.|矢印キーで日を移動し、Enter で根拠を表示します。
calendarNoActivity|No matching dated activity on this day.|Ezen a napon nincs megfelelő dátumozott aktivitás.|An diesem Tag gibt es keine passende datierte Aktivität.|Aucune activité datée correspondante ce jour-là.|この日に一致する日時付きの活動はありません。
rollingYear|Rolling year|Elmúlt egy év|Letztes Jahr|Année glissante|過去1年
custom|Custom dates|Egyéni dátumok|Eigene Daten|Dates personnalisées|期間を指定
start|Start date|Kezdő dátum|Startdatum|Date de début|開始日
end|End date|Záró dátum|Enddatum|Date de fin|終了日
date|Date|Dátum|Datum|Date|日付
timezone|Timezone|Időzóna|Zeitzone|Fuseau horaire|タイムゾーン
local|Local|Helyi|Lokal|Local|ローカル
sources|Sources|Források|Quellen|Sources|ソース
snapshots|Snapshots|Pillanatképek|Snapshots|Instantanés|スナップショット
collections|Collections|Gyűjtemények|Sammlungen|Collections|コレクション
platforms|Platforms|Platformok|Plattformen|Plateformes|プラットフォーム
platform|Platform|Platform|Plattform|Plateforme|プラットフォーム
formats|Export formats|Exportformátumok|Exportformate|Formats d’export|エクスポート形式
model|Model|Modell|Modell|Modèle|モデル
messageModel|Message-level model|Üzenetszintű modell|Modell auf Nachrichtenebene|Modèle par message|メッセージ単位のモデル
conversationModel|Conversation-level model|Beszélgetésszintű modell|Modell auf Gesprächsebene|Modèle par conversation|会話単位のモデル
modelFamilies|Model families|Modellcsaládok|Modellfamilien|Familles de modèles|モデル系列
categories|Content categories|Tartalmi kategóriák|Inhaltskategorien|Catégories de contenu|内容の分類
branches|Branch / version scope|Ág- és verzióhatókör|Zweig- und Versionsumfang|Portée des branches et versions|分岐と版の範囲
selected|Selected path / version|Kiválasztott útvonal / verzió|Ausgewählter Pfad / Version|Parcours / version choisis|選択された経路と版
allBranches|All retained records|Minden megőrzött rekord|Alle erhaltenen Datensätze|Tous les enregistrements conservés|保持されたすべての記録
alternative|Alternative records|Alternatív rekordok|Alternative Datensätze|Enregistrements alternatifs|代替の記録
perspective|Counting perspective|Számlálási nézőpont|Zählperspektive|Perspective de comptage|集計方式
unique|Unique conversations|Egyedi beszélgetések|Eindeutige Gespräche|Conversations uniques|一意の会話
memberships|Collection memberships|Gyűjteményi tagságok|Sammlungszugehörigkeiten|Appartenances aux collections|コレクション所属数
reliability|Reliability|Megbízhatóság|Zuverlässigkeit|Fiabilité|信頼性
recorded|Recorded|Rögzített|Erfasst|Enregistré|記録済み
derived|Derived from recorded data|Rögzített adatból származtatott|Aus erfassten Daten abgeleitet|Dérivé des données enregistrées|記録データから導出
estimated|Estimated|Becsült|Geschätzt|Estimé|推定
unavailable|Unavailable|Nem elérhető|Nicht verfügbar|Indisponible|利用不可
unknown|Unknown|Ismeretlen|Unbekannt|Inconnu|不明
undated|Undated|Dátum nélküli|Undatiert|Sans date|日付なし
partial|Partial|Részleges|Teilweise|Partiel|部分的
ambiguous|Ambiguous|Nem egyértelmű|Mehrdeutig|Ambigu|曖昧
unsupported|Unsupported|Nem támogatott|Nicht unterstützt|Non pris en charge|未対応
search|Search titles and observed excerpts|Címek és megfigyelt részletek keresése|Titel und beobachtete Auszüge suchen|Rechercher les titres et les extraits observés|タイトルと観測された抜粋を検索
contentFilter|Content characteristics|Tartalmi jellemzők|Inhaltsmerkmale|Caractéristiques du contenu|内容の特徴
hasCode|Has code blocks|Kódblokkot tartalmaz|Enthält Codeblöcke|Contient du code|コードブロックあり
hasAttachments|Has attachments|Mellékletet tartalmaz|Enthält Anhänge|Contient des pièces jointes|添付ファイルあり
hasLinks|Has links|Hivatkozást tartalmaz|Enthält Links|Contient des liens|リンクあり
capabilities|Capabilities|Képességek|Fähigkeiten|Capacités|機能
conversations|Conversations|Beszélgetések|Gespräche|Conversations|会話
user|User prompts|Felhasználói üzenetek|Nutzereingaben|Messages utilisateur|ユーザー入力
thinking|Exported thinking|Exportált gondolatmenet|Exportiertes Denken|Réflexion exportée|エクスポートされた思考
response|Assistant responses|Asszisztensi válaszok|Assistentenantworten|Réponses de l’assistant|アシスタント応答
recap|Reasoning recaps|Gondolatmenet-összefoglalók|Denkzusammenfassungen|Résumés de raisonnement|思考の要約
commentary|Intermediate commentary|Köztes kommentár|Zwischenkommentare|Commentaires intermédiaires|中間コメント
redacted-thinking|Redacted thinking|Kitakart gondolatmenet|Geschwärztes Denken|Réflexion masquée|非公開の思考
tool-call|Recorded tool calls|Rögzített eszközhívások|Erfasste Werkzeugaufrufe|Appels d’outils enregistrés|記録済みツール呼び出し
tool-output|Recorded tool outputs|Rögzített eszközkimenetek|Erfasste Werkzeugausgaben|Sorties d’outils enregistrées|記録済みツール出力
other|Other records|Egyéb rekordok|Andere Datensätze|Autres enregistrements|その他の記録
objects|Stored message objects|Tárolt üzenetobjektumok|Gespeicherte Nachrichtenobjekte|Objets de message stockés|保存されたメッセージオブジェクト
segments|Content segments|Tartalomszegmensek|Inhaltssegmente|Segments de contenu|内容セグメント
records|Records|Rekordok|Datensätze|Enregistrements|記録
count|Count|Darabszám|Anzahl|Nombre|件数
characters|Characters|Karakterek|Zeichen|Caractères|文字数
words|Word / text units|Szó- és szövegegységek|Wort- und Texteinheiten|Unités de mots et de texte|語とテキスト単位
lines|Lines|Sorok|Zeilen|Lignes|行数
coverage|Coverage|Lefedettség|Abdeckung|Couverture|網羅率
definition|Definition|Definíció|Definition|Définition|定義
definitions|Counting definitions|Számlálási definíciók|Zähldefinitionen|Définitions de comptage|集計の定義
evidence|Evidence|Bizonyítékok|Belege|Éléments probants|根拠
viewEvidence|Inspect contributing records|Beszámított rekordok megtekintése|Beitragende Datensätze prüfen|Examiner les enregistrements inclus|集計対象の記録を確認
includedBecause|Contribution rule|Beszámítási szabály|Beitragsregel|Règle de contribution|集計対象の理由
excerpt|Observed excerpt|Megfigyelt részlet|Beobachteter Auszug|Extrait observé|観測された抜粋
copy|Copy|Másolás|Kopieren|Copier|コピー
copied|Copied|Másolva|Kopiert|Copié|コピーしました
showTable|Exact data table|Pontos adattábla|Exakte Datentabelle|Tableau des données exactes|正確なデータ表
daily|Daily|Napi|Täglich|Quotidien|日別
weekly|Weekly|Heti|Wöchentlich|Hebdomadaire|週別
monthly|Monthly|Havi|Monatlich|Mensuel|月別
timeline|Activity timeline|Aktivitási idővonal|Aktivitätsverlauf|Chronologie de l’activité|活動の時系列
calendar|Calendar mosaic|Naptármozaik|Kalendermosaik|Mosaïque du calendrier|カレンダー表示
hourly|Hour of day|Óra szerinti eloszlás|Tagesstunden|Heures de la journée|時間帯別
weekdays|Day of week|Hét napja|Wochentage|Jours de la semaine|曜日別
activeDays|Active days|Aktív napok|Aktive Tage|Jours actifs|活動日数
streak|Longest streak|Leghosszabb sorozat|Längste Serie|Plus longue série|最長連続日数
busiest|Busiest day|Legaktívabb nap|Aktivster Tag|Jour le plus actif|最も活発な日
rolling|7-day rolling average|7 napos gördülő átlag|Gleitender 7-Tage-Durchschnitt|Moyenne mobile sur 7 jours|7日移動平均
composition|Observed composition|Megfigyelt összetétel|Beobachtete Zusammensetzung|Composition observée|観測された構成
textVolumes|Text volume by category|Szövegmennyiség kategóriánként|Textumfang nach Kategorie|Volume de texte par catégorie|分類別のテキスト量
lengths|Text-length distribution|Szöveghossz-eloszlás|Textlängenverteilung|Distribution des longueurs|テキスト長の分布
thinkingRatio|Observed trace / response ratio|Megfigyelt gondolatmenet/válasz arány|Beobachtetes Denkspur-/Antwortverhältnis|Rapport trace de réflexion / réponse|観測された思考トレースと応答の比率
code|Code blocks|Kódblokkok|Codeblöcke|Blocs de code|コードブロック
languages|Declared code languages|Megadott kódnyelvek|Deklarierte Codesprachen|Langages de code déclarés|宣言されたコード言語
codeLines|Code lines|Kódsorok|Codezeilen|Lignes de code|コード行数
links|Links|Hivatkozások|Links|Liens|リンク
citations|Citation records|Idézési rekordok|Zitatdatensätze|Enregistrements de citations|引用の記録
domains|Source domains|Forrásdomainek|Quelldomänen|Domaines sources|参照ドメイン
attachments|Attachments|Mellékletek|Anhänge|Pièces jointes|添付ファイル
attachmentTypes|Attachment types|Melléklettípusok|Anhangstypen|Types de pièces jointes|添付ファイルの種類
missingAttachments|Missing attachment bytes|Hiányzó mellékletadatok|Fehlende Anhangsdaten|Données de pièces jointes absentes|欠落した添付データ
tables|Markdown tables|Markdown-táblázatok|Markdown-Tabellen|Tableaux Markdown|Markdown 表
topConversations|Conversation detail|Beszélgetések részletei|Gesprächsdetails|Détails des conversations|会話の詳細
title|Title|Cím|Titel|Titre|タイトル
depth|Interaction depth|Interakciós mélység|Interaktionstiefe|Profondeur d’interaction|やり取りの深さ
alternatives|Retained alternatives|Megőrzött alternatívák|Erhaltene Alternativen|Alternatives conservées|保持された代替版
versions|Exported versions|Exportált verziók|Exportierte Versionen|Versions exportées|エクスポートされた版
repeated|Exact repeated prompts|Pontosan ismételt üzenetek|Exakt wiederholte Eingaben|Messages répétés à l’identique|完全一致の繰り返し入力
branchesCompare|Selected and all retained records|Kiválasztott és összes megőrzött rekord|Ausgewählte und alle erhaltenen Datensätze|Enregistrements choisis et conservés|選択済みとすべての保持記録
modelChanges|Model changes|Modellváltások|Modellwechsel|Changements de modèle|モデルの変更
modelTimeline|Daily model series|Napi modellidősorok|Tägliche Modellreihen|Séries quotidiennes par modèle|モデル別の日次系列
platformTimeline|Daily platform series|Napi platformidősorok|Tägliche Plattformreihen|Séries quotidiennes par plateforme|プラットフォーム別の日次系列
toolNames|Recorded call names|Rögzített hívásnevek|Namen erfasster Aufrufe|Noms des appels enregistrés|記録された呼び出し名
eventSequences|Event sequences|Eseménysorozatok|Ereignisfolgen|Séquences d’événements|イベントの系列
usage|Recorded usage|Rögzített használat|Erfasste Nutzung|Utilisation enregistrée|記録済み使用量
timing|Recorded durations|Rögzített időtartamok|Erfasste Dauern|Durées enregistrées|記録済み所要時間
indicator|Tool indicators|Eszközjelzések|Werkzeughinweise|Indicateurs d’outils|ツールの表示情報
context|Context occupancy|Kontextusfoglaltság|Kontextbelegung|Occupation du contexte|コンテキスト占有量
unit|Unit|Egység|Einheit|Unité|単位
kind|Kind|Típus|Art|Type|種類
value|Value|Érték|Wert|Valeur|値
status|Status|Állapot|Status|État|状態
capabilityMatrix|Capability matrix|Képességmátrix|Fähigkeitsmatrix|Matrice des capacités|機能対応表
diagnostics|Diagnostics|Diagnosztika|Diagnosen|Diagnostics|診断
provenance|Provenance|Eredet|Herkunft|Provenance|来歴
original|Original-record classification|Eredeti rekord besorolása|Klassifikation des Originaldatensatzes|Classification de l’enregistrement original|元記録の分類
normalized|Normalized-only classification|Csak normalizált besorolás|Nur normalisierte Klassifikation|Classification normalisée uniquement|正規化記録のみの分類
timestamp|Original timestamp|Eredeti időbélyeg|Originaler Zeitstempel|Horodatage d’origine|元の日時
precision|Date precision|Dátumpontosság|Datumsgenauigkeit|Précision de date|日時の精度
complete|Complete snapshot|Teljes pillanatkép|Vollständiger Snapshot|Instantané complet|完全なスナップショット
stale|Snapshot is older than source|A pillanatkép régebbi a forrásnál|Snapshot ist älter als die Quelle|L’instantané est antérieur à la source|ソースより古いスナップショット
captured|Captured|Rögzítve|Erfasst|Capturé|取得日時
snapshot|Snapshot identity|Pillanatkép-azonosító|Snapshot-Identität|Identité de l’instantané|スナップショット識別子
scope|Selection scope|Kiválasztási hatókör|Auswahlumfang|Portée de la sélection|選択範囲
coveragePeriod|Original date coverage|Eredeti dátumlefedettség|Originale Datumsabdeckung|Couverture des dates d’origine|元日時の対象範囲
reader|ThreadShelf Local Reader archive|ThreadShelf Local Reader archívum|ThreadShelf-Local-Reader-Archiv|Archive ThreadShelf Local Reader|ThreadShelf Local Reader アーカイブ
files|Export files|Exportfájlok|Exportdateien|Fichiers d’export|エクスポートファイル
directory|Extracted export directory|Kibontott exportmappa|Entpacktes Exportverzeichnis|Dossier d’export extrait|展開済みエクスポートフォルダー
sourceHelp|Choose the archive directory or standalone exports. All source access is read-only.|Válasszon archívummappát vagy különálló exportot. Minden forráshozzáférés csak olvasás.|Archivverzeichnis oder einzelne Exporte wählen. Quellen werden nur gelesen.|Choisissez le dossier d’archive ou des exports. Les sources sont en lecture seule.|アーカイブフォルダーまたはエクスポートを選択します。ソースは読み取り専用です。
excludedHelp|Reader preferences, bookmarks, reading positions and Activity data never contribute to analytics.|A Reader beállításai, könyvjelzői, olvasási pozíciói és Activity adatai nem kerülnek az elemzésbe.|Reader-Einstellungen, Lesezeichen, Lesepositionen und Aktivitätsdaten fließen nie in die Analyse ein.|Les préférences, favoris, positions de lecture et données Activity sont exclus de l’analyse.|Reader の設定、ブックマーク、読書位置、Activity データは分析に使用しません。
noneSources|Connect your first source|Első forrás csatlakoztatása|Erste Quelle verbinden|Connecter votre première source|最初のソースを接続
noneHelp|Capture a Reader archive while Reader is open, or analyze exported conversations directly.|Rögzítse a Reader archívumát a Reader futása közben, vagy elemezzen közvetlenül exportokat.|Reader-Archiv bei geöffnetem Reader erfassen oder Exporte direkt analysieren.|Capturez une archive pendant que Reader est ouvert, ou analysez directement des exports.|Reader の起動中にアーカイブを取得するか、エクスポートを直接分析します。
noMatches|No matching activity|Nincs megfelelő aktivitás|Keine passende Aktivität|Aucune activité correspondante|一致する活動はありません
noMatchesHelp|Adjust the applied filters. Missing source data remains unavailable.|Módosítsa az alkalmazott szűrőket. A hiányzó forrásadat továbbra sem érhető el.|Angewandte Filter ändern. Fehlende Quelldaten bleiben nicht verfügbar.|Modifiez les filtres. Les données absentes restent indisponibles.|フィルターを調整してください。欠落データは利用できません。
noData|This export lacks the required data|Az export nem tartalmazza a szükséges adatot|Diesem Export fehlen die erforderlichen Daten|Cet export ne contient pas les données nécessaires|このエクスポートには必要なデータがありません
noEvidence|No contributing records in this selection|Nincs beszámított rekord ebben a kiválasztásban|Keine beitragenden Datensätze in dieser Auswahl|Aucun enregistrement inclus dans cette sélection|この選択に集計対象の記録はありません
loading|Calculating analysis…|Elemzés számítása…|Analyse wird berechnet…|Calcul de l’analyse…|分析を計算中…
capturing|Capturing source…|Forrás rögzítése…|Quelle wird erfasst…|Capture de la source…|ソースを取得中…
cancelled|Cancelled; previous snapshot remains usable|Megszakítva; a korábbi pillanatkép továbbra is használható|Abgebrochen; vorheriger Snapshot bleibt nutzbar|Annulé ; l’instantané précédent reste disponible|キャンセルしました。前のスナップショットは使用できます。
errorMessage|Operation failed; the last complete snapshot is retained.|A művelet sikertelen; az utolsó teljes pillanatkép megmarad.|Vorgang fehlgeschlagen; letzter vollständiger Snapshot bleibt erhalten.|Échec de l’opération ; le dernier instantané complet est conservé.|操作に失敗しました。最後の完全なスナップショットを保持します。
diskFull|Insufficient space in Analytics storage|Nincs elegendő hely az Analytics tárhelyén|Zu wenig Speicherplatz für Analytics|Espace insuffisant pour Analytics|Analytics の保存領域が不足しています
permission|Analytics could not access the selected path|Az Analytics nem éri el a kiválasztott útvonalat|Analytics kann den gewählten Pfad nicht öffnen|Analytics ne peut accéder au chemin choisi|選択したパスにアクセスできません
sourceChanged|Source changed during capture; retrying safely|A forrás rögzítés közben változott; biztonságos újrapróbálkozás|Quelle änderte sich während der Erfassung; sicherer Neuversuch|Source modifiée pendant la capture ; nouvelle tentative sûre|取得中にソースが変化しました。安全に再試行します。
sourceUnavailable|Source unavailable; captured analysis remains usable|A forrás nem elérhető; a rögzített elemzés használható|Quelle nicht verfügbar; erfasste Analyse bleibt nutzbar|Source indisponible ; l’analyse capturée reste utilisable|ソースが利用できません。取得済みの分析は使用できます。
sourceOverlap|Choose an output outside every source directory|Válasszon minden forrásmappán kívüli kimenetet|Ausgabe außerhalb aller Quellverzeichnisse wählen|Choisissez une destination hors de tous les dossiers sources|すべてのソースフォルダーの外に保存してください
storage|Analytics storage|Analytics tárhely|Analytics-Speicher|Stockage Analytics|Analytics の保存領域
clearCache|Clear Analytics caches|Analytics gyorsítótárak törlése|Analytics-Caches löschen|Vider les caches Analytics|Analytics キャッシュを消去
rebuild|Rebuild analysis|Elemzés újraépítése|Analyse neu aufbauen|Reconstruire l’analyse|分析を再構築
analyticsOnly|This affects Analytics only. Source files remain unchanged.|Ez csak az Analytics adatait érinti. A forrásfájlok változatlanok maradnak.|Dies betrifft nur Analytics. Quelldateien bleiben unverändert.|Ceci affecte uniquement Analytics. Les sources restent inchangées.|Analytics のみに適用します。ソースファイルは変更しません。
confirmRemove|Remove this captured source from Analytics?|Eltávolítja ezt a rögzített forrást az Analytics alkalmazásból?|Diese erfasste Quelle aus Analytics entfernen?|Supprimer cette source capturée d’Analytics ?|取得済みソースを Analytics から削除しますか？
appearance|Appearance|Megjelenés|Darstellung|Apparence|外観
interfaceTheme|Interface theme|Felülettéma|Oberflächenthema|Thème de l’interface|インターフェーステーマ
codeTheme|Code theme|Kódtéma|Codethema|Thème du code|コードテーマ
language|Interface language|Felület nyelve|Oberflächensprache|Langue de l’interface|表示言語
system|System|Rendszer|System|Système|システム
light|Light|Világos|Hell|Clair|ライト
dark|Dark|Sötét|Dunkel|Sombre|ダーク
highContrast|High contrast|Nagy kontraszt|Hoher Kontrast|Contraste élevé|高コントラスト
reducedMotion|Reduce motion|Mozgás csökkentése|Bewegung reduzieren|Réduire les animations|動きを減らす
reducedTransparency|Solid surfaces|Tömör felületek|Deckende Flächen|Surfaces opaques|不透明な表面
automaticRefresh|Automatic refresh interval (minutes; 0 = off)|Automatikus frissítés (perc; 0 = kikapcsolva)|Automatische Aktualisierung (Minuten; 0 = aus)|Actualisation automatique (minutes ; 0 = désactivée)|自動更新間隔（分、0 で無効）
settingsSaved|Analytics settings saved|Analytics beállítások mentve|Analytics-Einstellungen gespeichert|Réglages Analytics enregistrés|Analytics の設定を保存しました
comparison|Compare two explicit selections|Két egyértelmű kiválasztás összevetése|Zwei explizite Auswahlen vergleichen|Comparer deux sélections explicites|明示的な2つの選択を比較
selectionA|Selection A|A kiválasztás|Auswahl A|Sélection A|選択 A
selectionB|Selection B|B kiválasztás|Auswahl B|Sélection B|選択 B
useCurrent|Use current filters|Aktuális szűrők használata|Aktuelle Filter verwenden|Utiliser les filtres actuels|現在のフィルターを使用
previousPeriod|Previous equal-length period|Előző azonos hosszúságú időszak|Vorheriger gleich langer Zeitraum|Période précédente de même durée|直前の同じ長さの期間
difference|Difference|Különbség|Differenz|Différence|差
comparisonScope|Compare identical units; collection membership can change the population.|Azonos egységeket vessen össze; a gyűjteményi tagság változtathatja a populációt.|Gleiche Einheiten vergleichen; Sammlungszugehörigkeit kann die Population ändern.|Comparez des unités identiques ; l’appartenance peut changer la population.|同じ単位を比較してください。所属方式によって母集団が変わります。
exportFormat|Report format|Jelentésformátum|Berichtsformat|Format du rapport|レポート形式
aggregateDefault|Aggregates only by default. Exact chart tables, filters and definitions are included.|Alapértelmezés szerint csak összesítés. Pontos táblák, szűrők és definíciók szerepelnek benne.|Standardmäßig nur Aggregate. Exakte Tabellen, Filter und Definitionen sind enthalten.|Agrégats par défaut. Tableaux exacts, filtres et définitions sont inclus.|既定では集計のみです。正確な表、フィルター、定義を含めます。
includeEvidence|Include explicitly selected evidence excerpts (private text)|Kifejezetten kiválasztott bizonyítékrészletek hozzáadása (privát szöveg)|Explizit ausgewählte Belegauszüge einschließen (privater Text)|Inclure les extraits explicitement sélectionnés (texte privé)|明示的に選択した根拠の抜粋を含める（非公開テキスト）
exportDone|Report exported|Jelentés exportálva|Bericht exportiert|Rapport exporté|レポートを出力しました
annotations|Aliases, exclusions & virtual groups|Álnevek, kizárások és virtuális csoportok|Aliasse, Ausschlüsse und virtuelle Gruppen|Alias, exclusions et groupes virtuels|別名、除外、仮想グループ
alias|Display alias|Megjelenített álnév|Anzeigealias|Alias affiché|表示用の別名
exclude|Exclude from analysis|Kizárás az elemzésből|Von Analyse ausschließen|Exclure de l’analyse|分析から除外
group|Virtual group|Virtuális csoport|Virtuelle Gruppe|Groupe virtuel|仮想グループ
annotationHelp|Annotations belong only to Analytics. They never change source identities or content.|A megjegyzések kizárólag az Analytics részei. A forrásazonosítót és tartalmat nem módosítják.|Anmerkungen gehören nur Analytics. Quellidentitäten und Inhalte bleiben unverändert.|Les annotations appartiennent à Analytics. Elles ne changent ni les identités ni le contenu.|注釈は Analytics 独自のものです。ソースの識別子や内容は変更しません。
annotationsSaved|Analytics annotations saved|Analytics megjegyzések mentve|Analytics-Anmerkungen gespeichert|Annotations Analytics enregistrées|Analytics の注釈を保存しました
name|Name|Név|Name|Nom|名前
sortBy|Sort by|Rendezés|Sortieren nach|Trier par|並べ替え
ascending|Ascending|Növekvő|Aufsteigend|Croissant|昇順
descending|Descending|Csökkenő|Absteigend|Décroissant|降順
bytes|Bytes|Bájt|Bytes|Octets|バイト
seconds|Seconds|Másodperc|Sekunden|Secondes|秒
milliseconds|Milliseconds|Ezredmásodperc|Millisekunden|Millisecondes|ミリ秒
tokens|Tokens|Tokenek|Token|Jetons|トークン
reportVersion|Application / schema version|Alkalmazás- és sémaverzió|Anwendungs-/Schemaversion|Version de l’application / du schéma|アプリとスキーマの版
noConsumption|No usable recorded consumption ledger in this selection.|Nincs használható rögzített fogyasztási napló ebben a kiválasztásban.|Keine nutzbare erfasste Verbrauchsaufstellung in dieser Auswahl.|Aucun registre de consommation exploitable dans cette sélection.|この選択に利用可能な記録済み消費量はありません。
noThinking|Unexported or redacted thinking is unavailable, not observed zero.|A nem exportált vagy kitakart gondolatmenet nem elérhető, nem megfigyelt nulla.|Nicht exportiertes oder geschwärztes Denken ist nicht verfügbar, kein gemessener Nullwert.|La réflexion absente ou masquée est indisponible, pas un zéro observé.|未出力または非公開の思考は利用不可であり、観測されたゼロではありません。
metricHelp|Select a chart item or table row to inspect its contributing evidence.|Válasszon diagramelemet vagy táblasort a beszámított bizonyíték megtekintéséhez.|Diagrammelement oder Tabellenzeile wählen, um die zugehörigen Belege zu prüfen.|Sélectionnez un élément ou une ligne pour examiner les preuves incluses.|グラフ項目または表の行を選択すると集計の根拠を確認できます。
modelFilterHelp|Message-level filters retain only records bearing the selected model. Conversation-level filters retain the whole matching conversation.|Az üzenetszintű szűrő csak a kiválasztott modell rekordjait tartja meg. A beszélgetésszintű a teljes találó beszélgetést.|Nachrichtenfilter behalten nur Datensätze des Modells. Gesprächsfilter behalten das gesamte passende Gespräch.|Les filtres par message gardent les enregistrements du modèle. Ceux par conversation gardent toute la conversation.|メッセージ単位では該当モデルの記録だけを、会話単位では会話全体を対象にします。
lengthRule|Text units use Unicode segmentation. Code languages come from declared fences.|A szövegegységek Unicode-szegmentálást használnak. A kódnyelv a megadott kerítésből származik.|Texteinheiten nutzen Unicode-Segmentierung. Codesprachen stammen aus deklarierten Begrenzungen.|Les unités utilisent la segmentation Unicode. Les langages proviennent des balises déclarées.|テキスト単位は Unicode 分割を使用し、コード言語は宣言されたフェンスから取得します。
repeatedRule|Exact normalized prompt text within the selected population; distinct message identities are retained.|Pontosan egyező normalizált üzenetszöveg a kiválasztott populációban; a külön üzenetazonosítók megmaradnak.|Exakt normalisierter Eingabetext in der Auswahl; unterschiedliche Nachrichtenidentitäten bleiben erhalten.|Texte normalisé identique dans la sélection ; les identités distinctes sont conservées.|選択母集団内の正規化した入力テキストを完全一致で比較し、個別の識別子を保持します。
sourceSafety|Sources read-only · no telemetry · deterministic metrics|Csak olvasható források · nincs telemetria · determinisztikus mérőszámok|Quellen schreibgeschützt · keine Telemetrie · deterministische Messgrößen|Sources en lecture seule · aucune télémétrie · mesures déterministes|ソースは読み取り専用・テレメトリなし・決定論的指標
period|Period|Időszak|Zeitraum|Période|期間
refreshState|Refresh state|Frissítési állapot|Aktualisierungsstatus|État d’actualisation|更新状態
ready|Ready|Kész|Bereit|Prêt|準備完了
working|Working|Folyamatban|In Bearbeitung|En cours|処理中
sourceId|Source identity|Forrásazonosító|Quellidentität|Identité de la source|ソース識別子
languageEnglish|English|Angol|Englisch|Anglais|英語
languageHungarian|Hungarian|Magyar|Ungarisch|Hongrois|ハンガリー語
languageGerman|German|Német|Deutsch|Allemand|ドイツ語
languageFrench|French|Francia|Französisch|Français|フランス語
languageJapanese|Japanese|Japán|Japanisch|Japonais|日本語
draftFilters|Draft changes are applied only when you press Apply filters.|A változtatásokat a Szűrők alkalmazása gomb érvényesíti.|Entwurfsänderungen gelten erst nach Filter anwenden.|Les modifications sont appliquées avec Appliquer les filtres.|変更は「フィルターを適用」を押すと反映されます。
codeExcerpt|Code excerpt|Kódrészlet|Codeauszug|Extrait de code|コード抜粋
sequence|Sequence|Sorrend|Reihenfolge|Séquence|順序
metric|Measure|Mérőszám|Messgröße|Mesure|指標
selectedEvidence|Selected evidence|Kiválasztott bizonyíték|Ausgewählte Belege|Éléments sélectionnés|選択した根拠
virtualGroups|Virtual groups|Virtuális csoportok|Virtuelle Gruppen|Groupes virtuels|仮想グループ
excluded|Excluded|Kizárt|Ausgeschlossen|Exclu|除外済み
restore|Restore inclusion|Visszavétel|Wieder einschließen|Réinclure|対象に戻す
help|Help & definitions|Súgó és definíciók|Hilfe und Definitionen|Aide et définitions|ヘルプと定義
formatCoverage|Format and capability coverage is determined from each actual record.|A formátum- és képességlefedettség minden tényleges rekordból származik.|Format- und Fähigkeitsabdeckung wird pro tatsächlichem Datensatz bestimmt.|La couverture est déterminée pour chaque enregistrement réel.|形式と機能の網羅率は各記録の実際の内容から判断します。
limitEvidence|Showing first 100 contributing records; aggregate totals remain complete.|Az első 100 beszámított rekord látható; az összesítés teljes.|Die ersten 100 Belege werden gezeigt; Aggregate bleiben vollständig.|Affichage des 100 premiers enregistrements ; les agrégats restent complets.|最初の100件の根拠を表示します。集計は全件を対象にします。
minutes|Minutes|Perc|Minuten|Minutes|分
change|Change|Változás|Änderung|Variation|変化
recordedDurationHelp|Only explicit durations with recorded units are shown. Recap time is not complete compute time.|Csak egyértelmű, rögzített egységű időtartamok szerepelnek. Az összefoglaló ideje nem teljes számítási idő.|Nur explizite Dauern mit erfassten Einheiten. Zusammenfassungszeit ist keine gesamte Rechenzeit.|Seules les durées explicites sont affichées. Le temps de résumé n’est pas le calcul total.|単位が明記された時間のみ表示します。要約時間は総計算時間ではありません。
declared|Declared|Megadott|Deklariert|Déclaré|宣言済み
inferred|Inferred|Következtetett|Abgeleitet|Inféré|推定された分類
sourceNative|Source-native unit|Forrás saját egysége|Quellnative Einheit|Unité native de la source|ソース固有の単位
observed|Observed|Megfigyelt|Beobachtet|Observé|観測済み
available|Available|Elérhető|Verfügbar|Disponible|利用可能
noSavedViews|No saved views yet|Még nincs mentett nézet|Noch keine gespeicherten Ansichten|Aucune vue enregistrée|保存済みビューはありません
previewSource|Preview sources use synthetic data only; no files are accessed.|Az előnézet kizárólag szintetikus adatot használ; nem ér el fájlokat.|Vorschau nutzt nur synthetische Daten; keine Dateien werden geöffnet.|L’aperçu utilise des données synthétiques, sans accès aux fichiers.|プレビューは合成データのみを使用し、ファイルにアクセスしません。
coverageHelp|Missing metadata is kept separate from recorded zero values.|A hiányzó metaadat különbözik a rögzített nullától.|Fehlende Metadaten sind von erfassten Nullwerten getrennt.|Les métadonnées absentes sont distinctes des zéros enregistrés.|欠落メタデータは記録済みのゼロと区別します。
bytesUnavailable|Attachment bytes were not included in the export.|A mellékletadatokat az export nem tartalmazza.|Anhangsdaten fehlen im Export.|Les données de pièces jointes ne sont pas incluses.|添付データはエクスポートに含まれていません。
sourceSnapshot|Source / snapshot|Forrás / pillanatkép|Quelle / Snapshot|Source / instantané|ソースとスナップショット
recordLocation|Original field location|Eredeti mezőhely|Originale Feldposition|Emplacement d’origine du champ|元フィールドの位置
reportTime|Report time|Jelentés ideje|Berichtszeit|Date du rapport|レポート日時
until|through|eddig|bis|jusqu’au|まで
compositionRule|A response message and a thinking segment are different counting units.|A válaszüzenet és gondolatmenetszegmens eltérő számlálási egység.|Antwortnachricht und Denksegment sind unterschiedliche Zähleinheiten.|Un message de réponse et un segment de réflexion ont des unités distinctes.|応答メッセージと思考セグメントは異なる集計単位です。
accessDetails|Source writes are blocked by the access layer. Analytics reports must be outside sources.|A hozzáférési réteg tiltja a forrásírást. A jelentéseknek a forrásokon kívül kell lenniük.|Die Zugriffsschicht blockiert Quelländerungen. Berichte müssen außerhalb der Quellen liegen.|La couche d’accès bloque les écritures. Les rapports restent hors des sources.|アクセス層はソースへの書き込みを禁止し、レポートはソースの外に保存します。
duplicateAliases|Identity aliases and deduplication|Azonosító-álnevek és deduplikáció|Identitätsaliase und Deduplizierung|Alias d’identité et déduplication|識別子の別名と重複排除
scopeDiffers|Selections have different scopes. Check counting units before interpreting the difference.|A kiválasztások hatóköre eltér. A különbség értelmezése előtt ellenőrizze az egységeket.|Auswahlen haben unterschiedliche Umfänge. Vor Interpretation die Einheiten prüfen.|Les sélections diffèrent. Vérifiez les unités avant d’interpréter l’écart.|選択範囲が異なります。差を解釈する前に集計単位を確認してください。
coverageAll|Eligible records / selected records|Jogosult rekordok / kiválasztott rekordok|Geeignete / ausgewählte Datensätze|Enregistrements éligibles / sélectionnés|対象可能な記録／選択した記録
selectedGroup|Virtual group filter|Virtuális csoportszűrő|Filter für virtuelle Gruppe|Filtre de groupe virtuel|仮想グループのフィルター
evidenceTextSafe|Archived text is displayed as text. Remote content and links are never loaded.|Az archív szöveg szövegként látható. Távoli tartalom és hivatkozások nem töltődnek be.|Archivtext wird als Text angezeigt. Entfernte Inhalte und Links werden nie geladen.|Le texte archivé est affiché comme texte. Aucun contenu distant n’est chargé.|アーカイブはテキストとして表示し、外部コンテンツやリンクは読み込みません。
tableSearch|Search this table|Keresés ebben a táblában|Diese Tabelle durchsuchen|Rechercher dans ce tableau|この表を検索
originalModel|Original model label|Eredeti modellcímke|Originale Modellbezeichnung|Libellé original du modèle|元のモデル名
originalPlatform|Original platform label|Eredeti platformcímke|Originale Plattformbezeichnung|Libellé original de la plateforme|元のプラットフォーム名
privacy|Report privacy|Jelentés adatvédelme|Berichtsdatenschutz|Confidentialité du rapport|レポートのプライバシー
notes|Notes|Megjegyzések|Hinweise|Notes|注記
filterCount|active selections|aktív kiválasztás|aktive Auswahlen|sélections actives|選択中
recordedSize|Recorded size|Rögzített méret|Erfasste Größe|Taille enregistrée|記録済みサイズ
outputAssociations|Call / output associations|Hívás- és kimenetkapcsolatok|Aufruf-/Ausgabezuordnungen|Associations appels / sorties|呼び出しと出力の関連付け
normalizedCoverage|Original versus normalized coverage|Eredeti és normalizált lefedettség|Originale und normalisierte Abdeckung|Couverture originale et normalisée|元記録と正規化記録の網羅率
nonBillable|Context occupancy is not billable usage.|A kontextusfoglaltság nem számlázható használat.|Kontextbelegung ist keine abrechenbare Nutzung.|L’occupation du contexte n’est pas une utilisation facturable.|コンテキスト占有量は課金対象の使用量ではありません。
includeUndated|Also include undated records in date-filtered views|Dátum nélküli rekordok hozzáadása dátumszűréskor|Undatierte Datensätze auch bei Datumsfiltern einschließen|Inclure aussi les enregistrements sans date avec un filtre de dates|日付フィルターでも日付なしの記録を含める
sourceNotice|Reports and captured data can contain private information. Source files are never bundled.|A jelentések és rögzített adatok privát információt tartalmazhatnak. Forrásfájlok nem kerülnek a csomagba.|Berichte und erfasste Daten können privat sein. Quelldateien werden nie mitgeliefert.|Les rapports et captures peuvent être privés. Les sources ne sont jamais distribuées.|レポートと取得データは非公開情報を含むことがあります。ソースを配布物に含めません。
sourceEmpty|No captured conversations yet|Még nincs rögzített beszélgetés|Noch keine erfassten Gespräche|Aucune conversation capturée|取得済み会話はありません
invalidInput|Invalid selection or input|Érvénytelen kiválasztás vagy adat|Ungültige Auswahl oder Eingabe|Sélection ou saisie invalide|選択または入力が無効です
reportUnsupported|The selected report could not be generated|A kiválasztott jelentés nem készíthető el|Gewählter Bericht konnte nicht erstellt werden|Impossible de générer le rapport choisi|選択したレポートを生成できません
diagnosticCode|Diagnostic code|Diagnosztikai kód|Diagnosecode|Code de diagnostic|診断コード
datePrecisionHelp|Day-only and conversation-level dates never become precise message times.|A napra pontos és beszélgetésszintű dátum nem válik pontos üzenetidővé.|Tages- und Gesprächsdaten werden nie zu präzisen Nachrichtenzeiten.|Les dates par jour ou conversation ne deviennent pas des heures précises.|日付単位や会話単位の日時を精密なメッセージ時刻として扱いません。
snapshotCurrent|Published snapshot|Publikált pillanatkép|Veröffentlichter Snapshot|Instantané publié|公開済みスナップショット
duration|Duration|Időtartam|Dauer|Durée|所要時間
ratio|Ratio|Arány|Verhältnis|Rapport|比率
scopeUnit|Scope and units|Hatókör és egységek|Umfang und Einheiten|Portée et unités|範囲と単位
noToolCalls|No recorded tool invocations in this selection.|Nincs rögzített eszközhívás ebben a kiválasztásban.|Keine erfassten Werkzeugaufrufe in dieser Auswahl.|Aucun appel d’outil enregistré dans cette sélection.|この選択には記録済みツール呼び出しがありません。
dateRange|Date range|Dátumtartomány|Datumsbereich|Plage de dates|日付範囲
reportDefinition|Reports use the applied selection and include exact numerical tables.|A jelentés az alkalmazott kiválasztást és pontos számtáblákat tartalmazza.|Berichte verwenden die angewandte Auswahl mit exakten Zahlentabellen.|Les rapports utilisent la sélection appliquée et les tableaux numériques exacts.|レポートは適用済みの選択と正確な数値表を含みます。
annotationTarget|Conversation identity|Beszélgetésazonosító|Gesprächsidentität|Identité de la conversation|会話識別子
minutesAgo|minutes ago|perce|Minuten zuvor|minutes auparavant|分前
invalidDate|Invalid original date|Érvénytelen eredeti dátum|Ungültiges Originaldatum|Date d’origine invalide|元の日付が無効
freshness|Snapshot freshness|Pillanatkép frissessége|Snapshot-Aktualität|Fraîcheur de l’instantané|スナップショットの鮮度
neverLoaded|Not loaded|Nincs betöltve|Nicht geladen|Non chargé|未読込
scopeUnchanged|Current selection|Aktuális kiválasztás|Aktuelle Auswahl|Sélection actuelle|現在の選択
sortMetric|Conversation ranking measure|Beszélgetések rangsorolási mérőszáma|Messgröße der Gesprächsreihenfolge|Mesure de classement des conversations|会話の並べ替え指標
textLength|Observed characters|Megfigyelt karakterek|Beobachtete Zeichen|Caractères observés|観測された文字数
activeScope|applied|alkalmazva|angewandt|appliqué|適用済み
noUnknownZero|Unknown is shown explicitly; absent data never becomes a recorded zero.|Az ismeretlen érték látható; a hiányzó adat nem lesz rögzített nulla.|Unbekannt wird angezeigt; fehlende Daten werden nie zu erfasster Null.|Les valeurs inconnues sont explicites ; l’absence ne devient pas zéro.|不明な値を明示し、欠落データを記録済みゼロに変換しません。
readOnly|Read-only source|Csak olvasható forrás|Schreibgeschützte Quelle|Source en lecture seule|読み取り専用ソース
filtersSaved|Analytical view saved|Elemzési nézet mentve|Analyseansicht gespeichert|Vue analytique enregistrée|分析ビューを保存しました
clearConfirm|Clear captured Analytics data? Source registrations and settings are kept.|Törli a rögzített Analytics-adatokat? A forrásregisztrációk és beállítások megmaradnak.|Erfasste Analytics-Daten löschen? Quellenregistrierungen und Einstellungen bleiben erhalten.|Effacer les données capturées ? Les sources enregistrées et réglages sont conservés.|取得済みの分析データを消去しますか？ソース登録と設定は保持します。
sourceRemoved|Captured source removed from Analytics|Rögzített forrás eltávolítva az Analyticsból|Erfasste Quelle aus Analytics entfernt|Source capturée supprimée d’Analytics|取得済みソースを Analytics から削除しました
cacheCleared|Analytics caches cleared|Analytics gyorsítótárak törölve|Analytics-Caches gelöscht|Caches Analytics vidés|Analytics キャッシュを消去しました
normal|Normal|Normál|Normal|Normal|標準
connection|Source connection|Forráskapcsolat|Quellverbindung|Connexion source|ソース接続
updated|Updated|Frissítve|Aktualisiert|Mis à jour|更新済み
membershipScope|Collection membership can count the same conversation in multiple collections.|A gyűjteményi tagság ugyanazt a beszélgetést több gyűjteményben is számlálhatja.|Sammlungszugehörigkeit kann ein Gespräch in mehreren Sammlungen zählen.|L’appartenance peut compter une conversation dans plusieurs collections.|所属方式では同じ会話を複数のコレクションで数える場合があります。
days|Days|Nap|Tage|Jours|日
characterRatio|Thinking characters / response characters|Gondolatmenet-karakterek / válaszkarakterek|Denkzeichen / Antwortzeichen|Caractères de réflexion / réponse|思考文字数／応答文字数
singularRecord|record|rekord|Datensatz|enregistrement|記録
pluralRecords|records|rekord|Datensätze|enregistrements|記録
weekDay0|Sunday|Vasárnap|Sonntag|Dimanche|日曜日
weekDay1|Monday|Hétfő|Montag|Lundi|月曜日
weekDay2|Tuesday|Kedd|Dienstag|Mardi|火曜日
weekDay3|Wednesday|Szerda|Mittwoch|Mercredi|水曜日
weekDay4|Thursday|Csütörtök|Donnerstag|Jeudi|木曜日
weekDay5|Friday|Péntek|Freitag|Vendredi|金曜日
weekDay6|Saturday|Szombat|Samstag|Samedi|土曜日
median|Median|Medián|Median|Médiane|中央値
p90|90th percentile|90. percentilis|90. Perzentil|90e percentile|90パーセンタイル
maximum|Maximum|Maximum|Maximum|Maximum|最大値
averageActive|Average per active day|Aktív napra jutó átlag|Durchschnitt je aktivem Tag|Moyenne par jour actif|活動日あたりの平均
averageCalendar|Average per calendar day|Naptári napra jutó átlag|Durchschnitt je Kalendertag|Moyenne par jour civil|暦日あたりの平均
trace|Exported trace|Exportált gondolatmenet|Exportierte Denkspur|Trace exportée|エクスポートされたトレース
summaryOnly|Exported summary only|Csak exportált összefoglaló|Nur exportierte Zusammenfassung|Résumé exporté uniquement|エクスポートされた要約のみ
identityAlias|Explicit identity alias target|Azonosító-álnév célja|Explizites Identitätsalias-Ziel|Cible explicite d’alias d’identité|明示的な識別子別名の対象
identityAliasHelp|Only map identities you have verified refer to the same conversation.|Csak igazoltan azonos beszélgetések azonosítóit kapcsolja össze.|Nur geprüfte Identitäten desselben Gesprächs zuordnen.|Associez uniquement les identités vérifiées de la même conversation.|同じ会話であると確認済みの識別子のみ関連付けてください。
modelFamilyAlias|Model-family alias|Modellcsalád-álnév|Modellfamilienalias|Alias de famille de modèles|モデル系列の別名
timeBasis|Date basis|Dátumalap|Datumsbasis|Base temporelle|日時の基準
messageDates|Original message / event dates|Eredeti üzenet- és eseménydátumok|Originale Nachrichten-/Ereignisdaten|Dates originales des messages et événements|元のメッセージとイベントの日時
conversationDates|Explicit conversation-level dates|Kifejezett beszélgetésszintű dátumok|Explizite Gesprächsdaten|Dates explicites des conversations|明示的な会話単位の日時
calendarYearNumber|Calendar year number|Naptári év száma|Kalenderjahr|Numéro de l’année civile|暦年
previousAnalysis|Calculating the applied selection. Previous completed results remain visible below.|A kiválasztás számítása folyamatban. Alább a korábbi teljes eredmények láthatók.|Die Auswahl wird berechnet. Vorherige vollständige Ergebnisse bleiben unten sichtbar.|Calcul de la sélection. Les résultats complets précédents restent visibles ci-dessous.|選択を計算中です。前回の完全な結果を下に表示しています。
modelDeveloper|Recorded model developer|Rögzített modellfejlesztő|Erfasster Modellentwickler|Développeur du modèle enregistré|記録済みモデル開発者
tablePages|Exact table pages|Pontos adattábla oldalai|Seiten der exakten Datentabelle|Pages du tableau exact|正確なデータ表のページ
previousPage|Previous page|Előző oldal|Vorherige Seite|Page précédente|前のページ
nextPage|Next page|Következő oldal|Nächste Seite|Page suivante|次のページ
page|Page|Oldal|Seite|Page|ページ
tableRows|rows|sor|Zeilen|lignes|行
bootLoading|Loading ThreadShelf Local Analytics…|A ThreadShelf Local Analytics betöltése…|ThreadShelf Local Analytics wird geladen…|Chargement de ThreadShelf Local Analytics…|ThreadShelf Local Analytics を読み込み中…
bootFailed|ThreadShelf Local Analytics could not start.|A ThreadShelf Local Analytics nem tudott elindulni.|ThreadShelf Local Analytics konnte nicht starten.|ThreadShelf Local Analytics n’a pas pu démarrer.|ThreadShelf Local Analytics を起動できませんでした。
bootRetry|Retry|Újrapróbálás|Erneut versuchen|Réessayer|再試行
bootRetryHelp|Retry loading the local database and settings.|Próbálja újra a helyi adatbázis és beállítások betöltését.|Lokale Datenbank und Einstellungen erneut laden.|Réessayez de charger la base locale et les réglages.|ローカルデータベースと設定の読み込みを再試行します。
seriesHoverMode|Hover mode|Rámutatási mód|Hover-Modus|Mode de survol|ホバーモード
seriesHoverAll|All series|Minden sorozat|Alle Reihen|Toutes les séries|すべての系列
seriesHoverPoint|Single point|Egy pont|Einzelner Punkt|Point unique|単一の点
seriesHoverHelp|Show every displayed series at the hovered date.|Minden megjelenített sorozat mutatása a kijelölt dátumnál.|Alle angezeigten Reihen am gewählten Datum zeigen.|Afficher toutes les séries visibles à la date survolée.|ホバーした日付のすべての表示系列を示します。
seriesNoObservations|No observations on this date|Nincs megfigyelés ezen a napon|Keine Beobachtungen an diesem Datum|Aucune observation à cette date|この日付の観測値はありません
seriesUnavailable|Unavailable|Nem áll rendelkezésre|Nicht verfügbar|Indisponible|利用不可
seriesObservedCount|Observed segments|Megfigyelt szegmensek|Beobachtete Segmente|Segments observés|観測済みセグメント
`;
const explorerRows = `
explorer.compactBinHelp|Compact labels: k = 1,000; M = 1,000,000. Hover or focus a cell for its exact ranges.|Rövid jelölések: k = 1 000; M = 1 000 000. A pontos intervallumokhoz vigye az egeret a cellára, vagy helyezze rá a fókuszt.|Kompakte Beschriftung: k = 1.000; M = 1.000.000. Mauszeiger oder Fokus auf einer Zelle zeigt die genauen Bereiche.|Libellés compacts : k = 1 000 ; M = 1 000 000. Survolez une cellule ou placez-y le focus pour voir les intervalles exacts.|短縮表記：k = 1,000、M = 1,000,000。セルにマウスを置くかフォーカスすると正確な区間を表示します。
explorer.binGrid|Binned observation map|Intervallumok szerinti megfigyelési térkép|Beobachtungskarte nach Klassen|Carte des observations par intervalles|区間別の観測マップ
explorer.binGridHelp|Each row and column is one recorded range. Bins have equal visual spacing; colour and the number show the exact observation count. Missing data remains separate in coverage.|Minden sor és oszlop egy rögzített intervallum. Az intervallumok azonos helyet kapnak; a szín és a szám a megfigyelések pontos számát mutatja. A hiányzó adatok külön szerepelnek a lefedettségben.|Jede Zeile und Spalte entspricht einem erfassten Bereich. Klassen haben gleiche Abstände; Farbe und Zahl zeigen die genaue Beobachtungszahl. Fehlende Daten bleiben in der Abdeckung getrennt.|Chaque ligne et colonne correspond à un intervalle enregistré. Les intervalles ont un espacement égal ; la couleur et le nombre indiquent le compte exact. Les données manquantes restent séparées dans la couverture.|各行と列は記録された区間を表します。区間は等間隔で表示され、色と数値が正確な観測件数を示します。欠測データは網羅率で別に扱います。
explorer.binAxisPrompt|Observed prompt length · Unicode code points|Megfigyelt kérés hossza · Unicode-kódpontok|Beobachtete Anfragelänge · Unicode-Codepunkte|Longueur de requête observée · points de code Unicode|観測された入力の長さ · Unicode コードポイント
explorer.binAxisReply|Observed final-response length · Unicode code points|Megfigyelt végső válasz hossza · Unicode-kódpontok|Beobachtete Endantwortlänge · Unicode-Codepunkte|Longueur de réponse finale observée · points de code Unicode|観測された最終応答の長さ · Unicode コードポイント
explorer.binAxisTrace|Observed original-trace length · Unicode code points|Megfigyelt eredeti gondolatmenet hossza · Unicode-kódpontok|Beobachtete Länge des ursprünglichen Gedankengangs · Unicode-Codepunkte|Longueur de trace originale observée · points de code Unicode|観測された元の思考記録の長さ · Unicode コードポイント
explorer.binAxisSummary|Observed summary-only length · Unicode code points|Megfigyelt összefoglaló hossza · Unicode-kódpontok|Beobachtete Länge der Zusammenfassung · Unicode-Codepunkte|Longueur de résumé observée · points de code Unicode|観測された要約のみの長さ · Unicode コードポイント
explorer.binCountLegend|Observed count|Megfigyelt darabszám|Beobachtungszahl|Nombre observé|観測件数
explorer.noObservations|Zero observed support for this bin combination|Ebben az intervallumpárban nincs megfigyelés|Keine beobachteten Fälle für diese Klassenkombination|Aucune observation pour cette combinaison d’intervalles|この区間の組み合わせの観測件数はゼロです
explorer.noBinEvidence|No contributing observations in this cell.|Nincsenek hozzájáruló megfigyelések ebben a cellában.|Keine beitragenden Beobachtungen in dieser Zelle.|Aucune observation contributrice dans cette cellule.|このセルに該当する観測はありません。
explorer.allBinsVisible|All populated bins are shown.|Minden adatot tartalmazó intervallum látható.|Alle besetzten Klassen werden angezeigt.|Tous les intervalles contenant des données sont affichés.|観測のある区間をすべて表示しています。
explorer.rangeAtLeast|At least|Legalább|Mindestens|Au moins|以上
explorer.prevalenceLegend|Replies containing feature|A jellemzőt tartalmazó válaszok|Antworten mit dem Merkmal|Réponses contenant la caractéristique|特徴を含む応答
explorer.matrixSymmetricHelp|This matrix mirrors each recorded pair across the diagonal. Both cells open the same contributing observations.|A mátrix minden rögzített párt tükröz az átló mentén. Mindkét cella ugyanazokat a hozzájáruló megfigyeléseket nyitja meg.|Diese Matrix spiegelt jedes erfasste Paar an der Diagonalen. Beide Zellen öffnen dieselben beitragenden Beobachtungen.|Cette matrice reflète chaque paire enregistrée de part et d’autre de la diagonale. Les deux cellules ouvrent les mêmes observations.|この行列は記録された各ペアを対角線に対して対称に表示します。両方のセルから同じ観測を開けます。
explorer.axisModels|Model|Modell|Modell|Modèle|モデル
explorer.axisFeatures|Content feature|Tartalmi jellemző|Inhaltsmerkmal|Caractéristique du contenu|内容の特徴
explorer.axisDeclaredLanguages|Declared code language|Megadott kódnyelv|Deklarierte Programmiersprache|Langage de code déclaré|宣言されたコード言語
explorer.exactCellCount|Exact count|Pontos darabszám|Genaue Anzahl|Compte exact|正確な件数
explorer.visibleAxes|Displayed axes|Megjelenített tengelyek|Angezeigte Achsen|Axes affichés|表示中の軸
explorer.structureCount|Structure occurrences|Szerkezeti előfordulások|Strukturvorkommen|Occurrences de structures|構造の出現数
explorer.intensityScale|Colour scale|Színskála|Farbskala|Échelle de couleurs|色の尺度
explorer.logCountScale|Logarithmic colour scale; cell counts remain exact.|Logaritmikus színskála; a cellák darabszámai pontosak maradnak.|Logarithmische Farbskala; die Zellzahlen bleiben exakt.|Échelle de couleurs logarithmique ; les comptes des cellules restent exacts.|色は対数尺度で表示され、セルの件数は正確な値です。
explorer.enum.message|Original message dates|Eredeti üzenetdátumok|Ursprüngliche Nachrichtendaten|Dates originales des messages|元のメッセージ日時
explorer.enum.conversation|Explicit conversation-level dates|Kifejezett beszélgetési dátumok|Explizite Gesprächsdaten|Dates explicites de conversation|明示的な会話単位の日時
explorer.enum.Derived from recorded data|Derived from recorded data|Rögzített adatból származtatott|Aus erfassten Daten abgeleitet|Dérivé des données enregistrées|記録されたデータから算出
explorer.enum.All retained structural context|All retained structural context|Teljes megőrzött szerkezeti környezet|Gesamter erhaltener Strukturkontext|Tout le contexte structurel conservé|保存された構造の全範囲
explorer.enum.All retained conversation context|All retained conversation context|Teljes megőrzött beszélgetési környezet|Gesamter erhaltener Gesprächskontext|Tout le contexte de conversation conservé|保存された会話の全範囲
explorer.enum.Selected native reply path; all retained when branch=all|Selected native reply path; all retained if all branches applied|Kiválasztott eredeti válaszútvonal; minden megőrzött, ha összes ág alkalmazott|Ausgewählter nativer Antwortpfad; alle erhaltenen bei allen Zweigen|Parcours de réponse natif choisi ; tous les éléments si toutes branches appliquées|選択された元の応答経路。全分岐適用時は保存された全経路
explorer.enum.Permitted retained normalized objects; original metadata only where retained|Retained normalized objects; original metadata where retained|Megőrzött normalizált objektumok; eredeti metaadat, ahol megőrzött|Erhaltene normalisierte Objekte; Originalmetadaten soweit erhalten|Objets normalisés conservés ; métadonnées originales si conservées|保存された正規化オブジェクト。元のメタデータは保存されている場合のみ
explorer.enum.Original message/event timestamps only|Original message/event timestamps only|Csak eredeti üzenet-/eseményidőpontok|Nur ursprüngliche Nachrichten-/Ereigniszeitstempel|Horodatages originaux de messages/événements uniquement|元のメッセージ・イベント日時のみ
explorer.enum.Original precision retained; no substitute activity dates|Original precision retained; no substitute dates|Eredeti pontosság megőrizve; nincs helyettesítő dátum|Ursprüngliche Präzision erhalten; keine Ersatzdaten|Précision originale conservée ; pas de dates substituées|元の精度を保持し、日時を代用しません
explorer.enum.Preserved; day-only excluded from hourly measurements|Original precision retained; day-only dates excluded from hourly cells|Eredeti pontosság megőrizve; napdátum kizárt az óracellákból|Ursprüngliche Präzision erhalten; reine Tagesdaten aus Stundenzellen ausgeschlossen|Précision originale conservée ; dates journalières exclues des cellules horaires|元の精度を保持し、時間セルから日付のみの記録を除外
explorer.enum.Unicode code points per content segment|Unicode code points per observed content segment|Unicode-kódpont megfigyelt tartalmi szegmensenként|Unicode-Codepunkte je beobachtetem Inhaltssegment|Points de code par segment de contenu observé|観測した内容セグメントごとの Unicode コードポイント
explorer.enum.Unicode code points per supported logical message|Unicode code points per supported logical message|Unicode-kódpont támogatott logikai üzenetenként|Unicode-Codepunkte je unterstützter logischer Nachricht|Points de code par message logique pris en charge|対応する論理メッセージごとの Unicode コードポイント
explorer.enum.Observed Unicode code points|Observed Unicode code points|Megfigyelt Unicode-kódpontok|Beobachtete Unicode-Codepunkte|Points de code Unicode observés|観測された Unicode コードポイント
explorer.enum.Content segments|Content segments|Tartalmi szegmensek|Inhaltssegmente|Segments de contenu|内容セグメント
explorer.enum.Exact contributing selected segment identities; grouped units resolve all selected contributing segments|Exact contributing selected segments; groups include all selected contributing segments|Pontos hozzájáruló kiválasztott szegmensek; csoport minden hozzájáruló szegmenssel|Exakt beitragende ausgewählte Segmente; Gruppen enthalten alle beitragenden Segmente|Segments sélectionnés contributeurs exacts ; groupes avec tous les contributeurs choisis|寄与する選択セグメントの正確な ID。グループには全寄与セグメントを含む
explorer.enum.Exact contributing scoped segment identities; lazy paginated resolution|Exact contributing scoped segments; lazy paginated evidence|Pontos hozzájáruló hatókörbeli szegmensek; lusta lapozott bizonyíték|Exakt beitragende Segmente im Geltungsbereich; verzögerte paginierte Belege|Segments contributeurs exacts ; preuves différées et paginées|範囲内の寄与セグメントの正確な ID。必要時にページ分けして根拠を表示

explorer.contract.reason|Availability reason|Elérhetőség oka|Verfügbarkeitsgrund|Motif de disponibilité|利用可能性の理由

explorer.localPopulation|Displayed population|Megjelenített sokaság|Angezeigte Population|Population affichée|表示する母集団
explorer.tableScope|The numerical table matches local population controls. Complete report data retains other separately labelled populations.|A számtábla követi a helyi sokaságbeállítást. A teljes jelentés a többi külön jelölt sokaságot is őrzi.|Die Zahlentabelle folgt lokalen Populationssteuerungen. Vollständige Berichtsdaten behalten weitere getrennt beschriftete Populationen.|Le tableau suit les populations choisies localement. Les données complètes conservent les autres populations séparément libellées.|数値表は個別の母集団設定に一致します。完全なレポートには別々に示した他の母集団も保持します。

explorer.column.aliasOf|Explicit canonical alias|Kifejezett kanonikus álnév|Expliziter kanonischer Alias|Alias canonique explicite|明示的な正規別名
explorer.enum.explicit-alias-identity|Explicit canonical alias identity|Kifejezett kanonikus álnévazonosító|Explizite kanonische Aliasidentität|Identité d’alias canonique explicite|明示的な正規別名 ID

share|Share|Részarány|Anteil|Part|割合
explorer.historicalEvidenceUnavailable|The capture diff retained this count without its exact historical evidence identities. No current records are substituted.|A felvételkülönbség a számot pontos történeti rekordazonosítók nélkül őrizte meg. Nem helyettesítjük jelenlegi rekordokkal.|Die Erfassungsdifferenz enthält diese Anzahl ohne exakte historische Identitäten. Aktuelle Datensätze werden nicht eingesetzt.|La différence conserve ce nombre sans identités historiques exactes. Aucun enregistrement actuel n’est substitué.|差分は正確な過去の根拠 ID なしに件数を保持しています。現在のレコードで代用しません。
explorer.control.traceRepresentation|Thinking representation|Gondolatmenet reprezentációja|Darstellung des Gedankengangs|Représentation de réflexion|思考の表現
explorer.enum.forward|Forward original timestamp interval|Előrehaladó eredeti időköz|Vorwärts gerichtetes Originalzeitintervall|Intervalle temporel original croissant|順方向の元の日時区間
explorer.enum.date-precision-unavailable|Required timestamp precision unavailable|Szükséges időpontpontosság nem elérhető|Benötigte Zeitpräzision nicht verfügbar|Précision temporelle requise indisponible|必要な日時精度を利用不可
explorer.enum.filtered-gap|Filtered gap|Kiszűrt hézag|Filterlücke|Écart filtré|フィルターの間隔
explorer.enum.native adjacency|Verified native adjacency|Igazolt eredeti szomszédság|Verifizierte native Nachbarschaft|Adjacency native vérifiée|検証された元の隣接関係
explorer.enum.complete original topology|Complete original topology|Teljes eredeti topológia|Vollständige Originaltopologie|Topologie originale complète|完全な元のトポロジー
explorer.enum.partial supplied topology|Partial retained topology|Részleges megőrzött topológia|Teilweise erhaltene Topologie|Topologie conservée partielle|部分的な保存トポロジー
explorer.enum.Verified retained parent edges; root depth 0, including retained non-message nodes|Verified parent edges; root depth 0, non-message nodes included|Igazolt szülőélek; gyökérmélység 0, nem üzenet csomóponttal|Verifizierte Elternkanten; Wurzeltiefe 0, Nicht-Nachrichtenknoten eingeschlossen|Arêtes parent vérifiées ; profondeur racine 0, nœuds non-message inclus|検証された親の辺数。ルート深さ 0、メッセージ以外のノードを含む
explorer.enum.Complete observed text required|Complete observed text required|Teljes megfigyelt szöveg szükséges|Vollständiger beobachteter Text erforderlich|Texte complet observé requis|完全な観測テキストが必要
explorer.enum.Observed original trace; summary/redacted remain separate|Original trace required; summary/redacted separate|Eredeti gondolatmenet kell; összefoglaló/kitakart külön|Originaler Gedankengang erforderlich; Zusammenfassung/Schwärzung getrennt|Trace originale requise ; résumé/masquage séparés|元の思考記録が必要。要約・伏字は別
explorer.enum.Original clock-precision timestamp required|Original clock-precision timestamp required|Eredeti óraszintű időpont kell|Ursprünglicher genauer Zeitstempel erforderlich|Horodatage original précis requis|元の時刻精度の日時が必要
explorer.enum.Provider/export field semantics audit required; absent metadata unavailable|Audited provider/export semantics required; missing fields unavailable|Ellenőrzött szolgáltató/exportjelentés kell; hiányzó mező nem elérhető|Geprüfte Anbieter-/Exportsemantik erforderlich; fehlende Felder unverfügbar|Sémantique fournisseur/export vérifiée requise ; champs absents indisponibles|プロバイダー・出力形式の意味検証が必要。欠測フィールドは利用不可
explorer.enum.Recorded supported parent relation, not logical ID alone|Recorded trustworthy parent relation required|Rögzített megbízható szülőkapcsolat kell|Erfasste verlässliche Elternbeziehung erforderlich|Relation parent enregistrée fiable requise|記録された信頼できる親子関係が必要
explorer.enum.Same observation needs supplied positive context limit; absent metadata unavailable|Same observation needs supplied positive context limit|Azonos megfigyeléshez megadott pozitív kontextuslimit kell|Dieselbe Beobachtung benötigt gelieferte positive Kontextgrenze|Même observation exigeant une limite de contexte positive fournie|同じ観測に供給された正のコンテキスト上限が必要
explorer.enum.Validated unit/scope or recorded lifecycle required|Validated duration unit/scope or lifecycle required|Igazolt időtartamegység/kör vagy életciklus kell|Validierte Dauereinheit/Geltungsbereich oder Lebenszyklus erforderlich|Unité/périmètre de durée validé ou cycle requis|検証された時間の単位・範囲またはライフサイクルが必要
explorer.enum.Unicode code points|Unicode code points|Unicode-kódpontok|Unicode-Codepunkte|Points de code Unicode|Unicode コードポイント
explorer.enum.available recorded observations|Available recorded observations|Elérhető rögzített megfigyelések|Verfügbare erfasste Beobachtungen|Observations enregistrées disponibles|利用可能な記録済み観測
explorer.enum.content segment|Content segment|Tartalmi szegmens|Inhaltssegment|Segment de contenu|内容セグメント
explorer.enum.reply content segment|Final-response content segment|Végső válasz tartalmi szegmense|Endantwort-Inhaltssegment|Segment de réponse finale|最終応答の内容セグメント
explorer.enum.reply or metadata-bearing source object|Reply or metadata-bearing object|Válasz vagy metaadatot tartalmazó objektum|Antwort oder Metadatenobjekt|Objet de réponse ou porteur de métadonnées|応答またはメタデータ付きオブジェクト
explorer.enum.reply/recap/event source object|Reply/recap/event source object|Válasz/összefoglaló/esemény forrásobjektuma|Antwort-/Recap-/Ereignisquellobjekt|Objet source réponse/récapitulatif/événement|応答・要約・イベントのソースオブジェクト
explorer.enum.completed|Recorded completed status|Rögzített befejezett állapot|Erfasster Abschlussstatus|État terminé enregistré|記録された完了状態
explorer.enum.No reply model|No recorded reply model|Nincs rögzített válaszmodell|Kein erfasstes Antwortmodell|Aucun modèle de réponse enregistré|記録された応答モデルなし
explorer.column.identityScope|Identity scope|Azonosító hatóköre|Identitätsgeltungsbereich|Périmètre d’identité|識別情報の範囲
explorer.column.hashBasis|Fingerprint basis|Lenyomat alapja|Fingerabdruckbasis|Base d’empreinte|指紋の基準
explorer.column.evidenceAvailability|Historical evidence availability|Történeti bizonyíték elérhetősége|Verfügbarkeit historischer Belege|Disponibilité des preuves historiques|過去の根拠の利用可能性
explorer.column.id|Scoped record ID|Hatókörbeli rekordazonosító|Datensatz-ID im Geltungsbereich|ID d’enregistrement dans le périmètre|範囲内のレコード ID
explorer.column.conversationId|Scoped conversation ID|Hatókörbeli beszélgetésazonosító|Gesprächs-ID im Geltungsbereich|ID de conversation dans le périmètre|範囲内の会話 ID
explorer.column.objectId|Original object ID|Eredeti objektumazonosító|Originale Objekt-ID|ID d’objet original|元のオブジェクト ID
explorer.column.logicalId|Logical message ID|Logikai üzenetazonosító|Logische Nachrichten-ID|ID de message logique|論理メッセージ ID
explorer.column.rawPath|Original record location|Eredeti rekordhely|Ursprünglicher Datensatzort|Emplacement original de l’enregistrement|元のレコード位置
explorer.column.leftFingerprint|A fingerprint|A lenyomata|Fingerabdruck A|Empreinte A|A の指紋
explorer.column.rightFingerprint|B fingerprint|B lenyomata|Fingerabdruck B|Empreinte B|B の指紋
explorer.column.left|A retained metadata|A megőrzött metaadata|Erhaltene Metadaten A|Métadonnées A conservées|A の保存メタデータ
explorer.column.right|B retained metadata|B megőrzött metaadata|Erhaltene Metadaten B|Métadonnées B conservées|B の保存メタデータ
explorer.diff.capabilityChanges|Capability changes|Képességváltozások|Fähigkeitsänderungen|Changements de capacités|機能の変化
explorer.diff.selectedPathChanges|Selected-path changes|Kiválasztottútvonal-változások|Änderungen des ausgewählten Pfades|Changements du parcours sélectionné|選択経路の変化
explorer.diff.conversationsAdded|Added conversations|Hozzáadott beszélgetések|Hinzugefügte Gespräche|Conversations ajoutées|追加された会話
explorer.diff.conversationsRemoved|Removed conversations|Eltávolított beszélgetések|Entfernte Gespräche|Conversations supprimées|削除された会話
explorer.variant.20-retained-branches-versions|Retained structure and variants|Megőrzött szerkezet és változatok|Erhaltene Struktur und Varianten|Structure et variantes conservées|保存構造と版
explorer.control.traceLens|Trace relationship unit|Gondolatmenet-kapcsolat egysége|Beziehungseinheit des Gedankengangs|Unité de relation de la trace|思考記録の関係単位
explorer.control.dimension|Aligned comparison dimension|Igazított összehasonlítási dimenzió|Gemeinsame Vergleichsdimension|Dimension de comparaison alignée|比較の共通次元
explorer.control.conversationId|Conversation for the retained path|Beszélgetés a megőrzött útvonalhoz|Gespräch für den erhaltenen Pfad|Conversation du parcours conservé|保存経路を表示する会話
explorer.control.matrixDimension|Presence-set dimension|Jelenléthalmaz dimenziója|Dimension der Präsenzmenge|Dimension de l’ensemble de présence|有無の集合の次元
explorer.value.category|Content category|Tartalmi kategória|Inhaltskategorie|Catégorie de contenu|内容カテゴリ
explorer.value.day|Original calendar day|Eredeti naptári nap|Ursprünglicher Kalendertag|Jour calendaire original|元の暦日
explorer.value.thinking|Exported thinking|Exportált gondolatmenet|Exportierter Gedankengang|Réflexion exportée|出力された思考
explorer.value.language|Declared code language|Deklarált kódnyelv|Deklarierte Codesprache|Langage déclaré|宣言されたコード言語
explorer.value.object|Recorded object groups|Rögzített objektumcsoportok|Erfasste Objektgruppen|Groupes d’objets enregistrés|記録されたオブジェクトのグループ
explorer.variant.19-path-ladder|Selected conversation ladder|Kiválasztott beszélgetés útvonala|Pfad des ausgewählten Gesprächs|Parcours de la conversation sélectionnée|選択会話の経路
explorer.variant.19-native-transitions|Verified native model transitions|Igazolt eredeti modellátmenetek|Verifizierte native Modellwechsel|Transitions de modèles natives vérifiées|検証されたネイティブなモデル遷移
explorer.variant.20-retained-structure|Retained structure totals|Megőrzött szerkezet összesítése|Summen erhaltener Struktur|Totaux de structure conservée|保存構造の合計
explorer.variant.20-retained-node-graph|Retained parent graph|Megőrzött szülőgráf|Erhaltener Elterngraph|Graphe des parents conservé|保存された親子グラフ
explorer.variant.23-recorded-duration-distribution|Validated duration histogram|Igazolt időtartam-hisztogram|Validiertes Dauerhistogramm|Histogramme de durée validée|検証された時間のヒストグラム
explorer.variant.23-lifecycle-lanes|Recorded endpoint spans|Rögzített végpontszakaszok|Erfasste Endpunktspannen|Intervalles d’extrémités enregistrées|記録された開始・終了区間
explorer.variant.23-verified-task-concurrency|Verified task concurrency counts|Igazolt párhuzamos feladatszámok|Verifizierte gleichzeitige Aufgabenanzahl|Comptes de tâches simultanées vérifiées|検証された同時タスク件数
explorer.variant.24-usage-field-distribution|Audited request fields|Ellenőrzött kérésmezők|Geprüfte Anfragefelder|Champs de requête vérifiés|検証された要求フィールド
explorer.variant.24-request-input-output|Same-request input × output|Azonos kérés bemenet × kimenet|Eingabe × Ausgabe derselben Anfrage|Entrée × sortie d’une même requête|同じ要求の入力 × 出力
explorer.variant.24-context-occupancy|Supplied context fraction|Megadott kontextusarány|Gelieferter Kontextanteil|Fraction de contexte fournie|供給されたコンテキスト割合
explorer.variant.26-distribution-shifts|R7 quantile shifts|R7-kvantiliseltolódások|R7-Quantilverschiebungen|Décalages des quantiles R7|R7 分位点の変化
explorer.variant.26-distribution-overlay|Aligned histogram overlay|Igazított hisztogramok|Histogrammüberlagerung gleicher Klassen|Superposition des histogrammes alignés|同じビンのヒストグラム比較
explorer.variant.26-ecdf-overlay|Aligned cumulative overlay|Igazított kumulatív összehasonlítás|Gemeinsame kumulative Überlagerung|Superposition cumulative alignée|累積分布の比較
explorer.historyEvidence|History tables describe the selected immutable captures. Removed historical records require retained prior-capture evidence and are not replaced with current records.|A történettáblák a kiválasztott változtathatatlan felvételeket írják le. Eltávolított régi rekordhoz megőrzött korábbi bizonyíték kell; nem helyettesítjük jelenlegi rekorddal.|Verlaufstabellen beschreiben ausgewählte unveränderliche Erfassungen. Entfernte alte Datensätze brauchen erhaltene frühere Belege und werden nicht durch aktuelle ersetzt.|Les tableaux décrivent les captures immuables choisies. Les anciens éléments supprimés exigent des preuves antérieures conservées et ne sont pas remplacés par les actuels.|履歴表は選択した不変キャプチャを示します。削除された過去のレコードには保存された当時の根拠が必要で、現在のレコードでは代替しません。
explorer.enum.group|Exact group|Pontos csoport|Exakte Gruppe|Groupe exact|完全一致グループ
explorer.enum.spectrum|Repeat spectrum|Ismétlési spektrum|Wiederholungsspektrum|Spectre des répétitions|反復スペクトル
explorer.enum.rank|Ranking|Rangsor|Rangfolge|Classement|順位
explorer.enum.top-share|Top contribution|Legnagyobb hozzájárulás|Oberster Beitrag|Contribution supérieure|上位の寄与
explorer.enum.summary|Distribution summary|Eloszlási összefoglaló|Verteilungsübersicht|Résumé de distribution|分布の要約
explorer.enum.histogram|Histogram bin|Hisztogram-intervallum|Histogrammklasse|Classe d’histogramme|ヒストグラムのビン
explorer.enum.ecdf|ECDF threshold|ECDF-küszöb|ECDF-Schwelle|Seuil ECDF|ECDF しきい値
explorer.enum.dimensions|Image dimensions|Képméretek|Bildabmessungen|Dimensions de l’image|画像寸法
explorer.enum.pixels|Pixels|Képpontok|Pixel|Pixels|ピクセル
explorer.enum.aspect-ratio|Aspect ratio|Képarány|Seitenverhältnis|Rapport d’aspect|縦横比
explorer.enum.streak|Active-day run|Aktívnapsorozat|Aktive Tagesfolge|Série de jours actifs|活動日の連続
explorer.enum.gap|Intervening empty-day gap|Köztes üres napok szünete|Lücke leerer Zwischentage|Écart de jours vides intermédiaires|間の空白日
explorer.enum.streak-distribution|Run-length distribution|Sorozathossz-eloszlás|Verteilung der Serienlänge|Distribution des séries|連続日数の分布
explorer.enum.gap-distribution|Empty-day-gap distribution|Üresnap-szünet eloszlása|Verteilung leerer Tageslücken|Distribution des jours vides|空白日間隔の分布
explorer.enum.reversed-observation|Reversed original timestamps|Fordított eredeti időpontok|Umgekehrte ursprüngliche Zeitstempel|Horodatages originaux inversés|逆順の元の日時
explorer.enum.ratio-summary|Individual ratio summary|Egyéni arány összesítése|Einzelverhältnisübersicht|Résumé des rapports individuels|個別比率の要約
explorer.enum.density|Density bin|Sűrűségintervallum|Dichteklasse|Classe de densité|密度ビン
explorer.enum.cell|Exact matrix cell|Pontos mátrixcella|Exakte Matrixzelle|Cellule exacte de matrice|正確な行列セル
explorer.enum.population|Population summary|Sokaság összesítése|Populationsübersicht|Résumé de population|母集団の要約
explorer.enum.concentration|Domain concentration|Domainkoncentráció|Domainkonzentration|Concentration des domaines|ドメイン集中度
explorer.enum.domain-model|Domain × model|Domain × modell|Domain × Modell|Domaine × modèle|ドメイン × モデル
explorer.enum.domain-cooccurrence|Domain co-occurrence|Domain együttelőfordulása|Domainkookkurrenz|Cooccurrence des domaines|ドメイン共起
explorer.enum.domain-matrix-population|Domain matrix population|Domainmátrix sokasága|Domainmatrixpopulation|Population de matrice des domaines|ドメイン行列の母集団
explorer.enum.diversity|Recorded domain diversity|Rögzített domaindiverzitás|Erfasste Domainvielfalt|Diversité des domaines enregistrée|記録されたドメインの多様性
explorer.enum.textual-link|Textual link|Szöveges link|Textlink|Lien textuel|本文リンク
explorer.enum.structured-reference|Structured reference|Strukturált hivatkozás|Strukturierte Referenz|Référence structurée|構造化参照
explorer.enum.unlinked-citation-markers|Citation markers without URL|URL nélküli idézetjelölők|Zitatmarker ohne URL|Marqueurs de citation sans URL|URL のない引用マーカー
explorer.enum.unlinked-structured-references|Structured references without URL|URL nélküli strukturált hivatkozások|Strukturierte Referenzen ohne URL|Références structurées sans URL|URL のない構造化参照
explorer.enum.headings|Headings|Címsorok|Überschriften|Titres|見出し
explorer.enum.lists|Lists|Listák|Listen|Listes|リスト
explorer.enum.listItems|List items|Listaelemek|Listenelemente|Éléments de liste|リスト項目
explorer.enum.quotes|Quotes|Idézetek|Zitate|Citations|引用
explorer.enum.inlineCode|Inline code|Sorközi kód|Inline-Code|Code en ligne|インラインコード
explorer.enum.fencedCode|Fenced code|Keretezett kód|Eingefasster Code|Code délimité|フェンス付きコード
explorer.enum.indentedCode|Indented code|Behúzott kód|Eingerückter Code|Code indenté|インデントコード
explorer.enum.thematicBreaks|Thematic breaks|Tematikus elválasztók|Thematische Trenner|Séparateurs thématiques|水平区切り
explorer.enum.paragraphs|Paragraphs|Bekezdések|Absätze|Paragraphes|段落
explorer.enum.fences|Fenced blocks|Kódblokkok|Eingefasste Blöcke|Blocs délimités|フェンス付きブロック
explorer.enum.attachment-metadata|Retained attachment metadata|Megőrzött melléklet-metaadat|Erhaltene Anhangsmetadaten|Métadonnées de pièces jointes conservées|保存された添付メタデータ
explorer.enum.filtered gap|Filtered gap|Kiszűrt hézag|Filterlücke|Écart filtré|フィルターの間隔
explorer.enum.retained object|Retained source object|Megőrzött forrásobjektum|Erhaltenes Quellobjekt|Objet source conservé|保存されたソースオブジェクト
explorer.enum.non-message node|Non-message node|Nem üzenet csomópont|Nicht-Nachrichtenknoten|Nœud non-message|メッセージ以外のノード
explorer.enum.missing-parent|Missing parent|Hiányzó szülő|Fehlender Elternknoten|Parent manquant|親の欠落
explorer.enum.missing parent|Missing parent|Hiányzó szülő|Fehlender Elternknoten|Parent manquant|親の欠落
explorer.enum.cycle|Recorded parent cycle|Rögzített szülőciklus|Erfasster Elternzyklus|Cycle parent enregistré|記録された親の循環
explorer.enum.unverified-parent|Unverified parent|Nem igazolt szülő|Unverifizierter Elternknoten|Parent non vérifié|未検証の親
explorer.enum.unverified parent|Unverified parent|Nem igazolt szülő|Unverifizierter Elternknoten|Parent non vérifié|未検証の親
explorer.enum.no preceding reply|No retained preceding reply|Nincs megőrzött korábbi válasz|Keine erhaltene vorherige Antwort|Aucune réponse précédente conservée|先行する保存応答なし
explorer.enum.recorded selected parent path|Recorded selected parent path|Rögzített kiválasztott szülőútvonal|Erfasster ausgewählter Elternpfad|Parcours parent sélectionné enregistré|記録された選択親経路
explorer.enum.source-record order|Original source-record order|Eredeti forrásrekord-sorrend|Ursprüngliche Quelldatensatzreihenfolge|Ordre original des enregistrements|元のソースレコード順序
explorer.enum.retained serialization order|Retained serialization order|Megőrzött tárolási sorrend|Erhaltene Serialisierungsreihenfolge|Ordre de sérialisation conservé|保存されたシリアル化順序
explorer.enum.recorded-parent|Recorded parent relation|Rögzített szülőkapcsolat|Erfasste Elternbeziehung|Relation parent enregistrée|記録された親子関係
explorer.enum.original-recorded-source-order|Recorded source order|Rögzített forrássorrend|Erfasste Quellreihenfolge|Ordre source enregistré|記録されたソース順序
explorer.enum.complete|Complete retained topology|Teljes megőrzött topológia|Vollständige erhaltene Topologie|Topologie conservée complète|完全な保存トポロジー
explorer.enum.partial|Partial retained topology|Részleges megőrzött topológia|Teilweise erhaltene Topologie|Topologie conservée partielle|部分的な保存トポロジー
explorer.enum.verified retained node|Verified retained node|Igazolt megőrzött csomópont|Verifizierter erhaltener Knoten|Nœud conservé vérifié|検証された保存ノード
explorer.enum.Retained root|Retained root|Megőrzött gyökér|Erhaltene Wurzel|Racine conservée|保存されたルート
explorer.enum.Missing parent|Missing parent|Hiányzó szülő|Fehlender Elternknoten|Parent manquant|親の欠落
explorer.enum.zero|Zero retained matching outputs|Nulla megőrzött illeszkedő kimenet|Keine erhaltene passende Ausgabe|Zéro sortie associée conservée|対応する保存出力 0 件
explorer.enum.one|One retained matching output|Egy megőrzött illeszkedő kimenet|Eine erhaltene passende Ausgabe|Une sortie associée conservée|対応する保存出力 1 件
explorer.enum.multiple|Multiple retained matching outputs|Több megőrzött illeszkedő kimenet|Mehrere erhaltene passende Ausgaben|Plusieurs sorties associées conservées|対応する保存出力が複数
explorer.enum.unmatched|Unmatched retained output|Pár nélküli megőrzött kimenet|Unzugeordnete erhaltene Ausgabe|Sortie conservée sans correspondance|対応しない保存出力
explorer.enum.Unmatched outputs|Unmatched outputs|Pár nélküli kimenetek|Unzugeordnete Ausgaben|Sorties sans correspondance|対応しない出力
explorer.enum.No retained matching call|No retained matching call|Nincs megőrzött illeszkedő hívás|Kein erhaltener passender Aufruf|Aucun appel associé conservé|対応する保存呼び出しなし
explorer.enum.event-execution|Recorded event execution|Rögzített eseményvégrehajtás|Erfasste Ereignisausführung|Exécution d’événement enregistrée|記録されたイベント実行
explorer.enum.source-execution|Recorded source execution|Rögzített forrásvégrehajtás|Erfasste Quellausführung|Exécution source enregistrée|記録されたソース実行
explorer.enum.request-execution|Recorded request execution|Rögzített kérésvégrehajtás|Erfasste Anfrageausführung|Exécution de requête enregistrée|記録された要求実行
explorer.enum.verified task lifecycle|Verified task lifecycle|Igazolt feladatéletciklus|Verifizierter Aufgabenlebenszyklus|Cycle de tâche vérifié|検証されたタスクのライフサイクル
explorer.enum.recorded item creation/completion; not execution|Recorded creation/completion interval|Rögzített létrehozási/befejezési időköz|Erfasstes Erstellungs-/Abschlussintervall|Intervalle de création/fin enregistré|記録された作成・完了の区間
explorer.enum.input|Recorded input field|Rögzített bemeneti mező|Erfasstes Eingabefeld|Champ d’entrée enregistré|記録された入力フィールド
explorer.enum.output|Recorded output field|Rögzített kimeneti mező|Erfasstes Ausgabefeld|Champ de sortie enregistré|記録された出力フィールド
explorer.enum.cached-overlap|Cached subset overlapping input|Bemenettel átfedő gyorsítótárrész|Mit Eingabe überlappende Cache-Teilmenge|Sous-ensemble en cache inclus dans l’entrée|入力と重複するキャッシュ部分
explorer.enum.reasoning-overlap|Reasoning subset overlapping output|Kimenettel átfedő gondolatmenetrész|Mit Ausgabe überlappende Denk-Teilmenge|Sous-ensemble de réflexion inclus dans la sortie|出力と重複する思考部分
explorer.enum.A only|A only|Csak A|Nur A|A uniquement|A のみ
explorer.enum.A ∩ B|A ∩ B|A ∩ B|A ∩ B|A ∩ B|A ∩ B
explorer.enum.B only|B only|Csak B|Nur B|B uniquement|B のみ
explorer.enum.scoped-conversation-identity|Scoped conversation identity|Hatókörbeli beszélgetésazonosító|Gesprächsidentität im Geltungsbereich|Identité de conversation dans le périmètre|範囲内の会話 ID
explorer.enum.exact-prompt-content|Exact prompt content|Pontos kéréstartalom|Exakter Anfrageinhalt|Contenu exact de requête|完全一致の入力内容
explorer.enum.explicitly affected selected record|Explicitly linked selected record|Kifejezetten kapcsolt kiválasztott rekord|Explizit zugeordneter ausgewählter Datensatz|Enregistrement sélectionné explicitement lié|明示的に関連付けた選択レコード
explorer.enum.conversation diagnostic|Conversation-level diagnostic|Beszélgetésszintű diagnosztika|Diagnose auf Gesprächsebene|Diagnostic de conversation|会話単位の診断
explorer.enum.conversation representation|Conversation representation|Beszélgetés reprezentációja|Gesprächsdarstellung|Représentation de conversation|会話の表現
explorer.enum.text|Observed full text|Megfigyelt teljes szöveg|Beobachteter vollständiger Text|Texte complet observé|観測された完全テキスト
explorer.enum.clock|Original clock-precision timestamps|Eredeti óraszintű időpontok|Ursprüngliche genaue Zeitstempel|Horodatages originaux précis|元の時刻精度の日時
explorer.enum.duration|Validated duration observations|Igazolt időtartam-megfigyelések|Validierte Dauerbeobachtungen|Observations de durées validées|検証された時間の観測
explorer.enum.added conversation|Added conversation|Hozzáadott beszélgetés|Hinzugefügtes Gespräch|Conversation ajoutée|追加された会話
explorer.enum.removed conversation|Removed conversation|Eltávolított beszélgetés|Entferntes Gespräch|Conversation supprimée|削除された会話
explorer.enum.changed content hash|Changed content fingerprint|Módosult tartalomlenyomat|Geänderter Inhaltsfingerabdruck|Empreinte de contenu modifiée|内容指紋の変更
explorer.enum.unchanged content hash|Unchanged content fingerprint|Változatlan tartalomlenyomat|Unveränderter Inhaltsfingerabdruck|Empreinte de contenu inchangée|未変更の内容指紋
explorer.enum.content hash unavailable|Content fingerprint unavailable|Tartalomlenyomat nem elérhető|Inhaltsfingerabdruck nicht verfügbar|Empreinte de contenu indisponible|内容指紋を利用不可
explorer.enum.selected path changed|Selected path changed|Kiválasztott útvonal módosult|Ausgewählter Pfad geändert|Parcours sélectionné modifié|選択経路の変更
explorer.enum.capabilities changed|Retained capabilities changed|Megőrzött képességek módosultak|Erhaltene Fähigkeiten geändert|Capacités conservées modifiées|保存された機能の変更
lower|Lower bound|Alsó határ|Untere Grenze|Borne inférieure|下限
upper|Upper bound|Felső határ|Obere Grenze|Borne supérieure|上限
upperUnbounded|Unbounded upper edge|Korlátlan felső határ|Unbegrenzte Obergrenze|Borne supérieure illimitée|上限なし
population|Population|Sokaság|Population|Population|母集団
cumulative|Cumulative count|Kumulatív szám|Kumulative Anzahl|Nombre cumulé|累積件数
cumulativeValue|Cumulative volume|Kumulatív mennyiség|Kumulatives Volumen|Volume cumulé|累積量
cumulativeShare|Cumulative share|Kumulatív arány|Kumulativer Anteil|Part cumulée|累積割合
threshold|Threshold|Küszöb|Schwelle|Seuil|しきい値
fraction|Fraction|Részarány|Anteil|Fraction|割合
denominator|Denominator|Nevező|Nenner|Dénominateur|分母
numerator|Numerator|Számláló|Zähler|Numérateur|分子
eligible|Eligible|Jogosult|Geeignet|Éligible|対象
unavailable|Unavailable|Nem elérhető|Nicht verfügbar|Indisponible|利用不可
minimum|Minimum|Minimum|Minimum|Minimum|最小値
maximum|Maximum|Maximum|Maximum|Maximum|最大値
mean|Arithmetic mean|Számtani átlag|Arithmetisches Mittel|Moyenne arithmétique|算術平均
smallSample|Small sample|Kis minta|Kleine Stichprobe|Petit échantillon|小標本
rank|Rank|Rangsor|Rang|Rang|順位
membershipWeight|Membership weight|Tagsági súly|Mitgliedschaftsgewicht|Poids d’appartenance|所属の重み
percentage|Percentile selection|Százalékos kiválasztás|Perzentilauswahl|Sélection centile|百分位選択
conversationCount|Conversation count|Beszélgetésszám|Gesprächsanzahl|Nombre de conversations|会話数
closed|Closed fences|Lezárt blokkok|Geschlossene Blöcke|Blocs fermés|閉じたフェンス
unclosed|Unclosed fences|Lezáratlan blokkok|Offene Blöcke|Blocs non fermés|未閉鎖フェンス
literalDeclarations|Literal declarations|Szó szerinti deklarációk|Wörtliche Deklarationen|Déclarations littérales|元の宣言
frequency|Exact frequency|Pontos gyakoriság|Exakte Häufigkeit|Fréquence exacte|完全一致の頻度
weightedFrequency|Weighted frequency|Súlyozott gyakoriság|Gewichtete Häufigkeit|Fréquence pondérée|重み付き頻度
groups|Distinct groups|Különálló csoportok|Verschiedene Gruppen|Groupes distincts|異なるグループ
promptOccurrences|Prompt occurrences|Kéréselőfordulások|Anfragevorkommen|Occurrences de requêtes|入力の出現数
distinctConversations|Distinct conversations|Különálló beszélgetések|Verschiedene Gespräche|Conversations distinctes|異なる会話
distinctModels|Distinct models|Különálló modellek|Verschiedene Modelle|Modèles distincts|異なるモデル
measure|Measure|Mérték|Messgröße|Mesure|測定値
width|Recorded width|Rögzített szélesség|Erfasste Breite|Largeur enregistrée|記録された幅
height|Recorded height|Rögzített magasság|Erfasste Höhe|Hauteur enregistrée|記録された高さ
aspectRatio|Aspect ratio|Képarány|Seitenverhältnis|Rapport d’aspect|縦横比
weekday|Weekday index|Hét napjának sorszáma|Wochentagsindex|Indice du jour|曜日番号
hour|Hour|Óra|Stunde|Heure|時間
month|Month|Hónap|Monat|Mois|月
year|Year|Év|Jahr|Année|年
calendarDays|Calendar days|Naptári napok|Kalendertage|Jours calendaires|暦日
rate|Per-day rate|Naponkénti ráta|Rate je Tag|Taux par jour|1 日当たりの率
withinYearShare|Within-year share|Éven belüli arány|Anteil im Jahr|Part dans l’année|年内割合
leftCensored|Left boundary censored|Bal határ cenzorált|Linker Rand zensiert|Limite gauche censurée|左境界で打ち切り
rightCensored|Right boundary censored|Jobb határ cenzorált|Rechter Rand zensiert|Limite droite censurée|右境界で打ち切り
length|Run/gap length|Sorozat/szünet hossza|Serien-/Lückenlänge|Longueur de série/écart|連続・間隔の長さ
cohort|First observed week|Első megfigyelt hét|Erste beobachtete Woche|Première semaine observée|最初の観測週
weekOffset|Week offset|Hételtérés|Wochenabstand|Décalage en semaines|週のオフセット
cohortConversations|Cohort conversations|Kohorsz beszélgetései|Kohortengespräche|Conversations de la cohorte|コホートの会話
insufficientFollowup|Insufficient follow-up|Elégtelen utánkövetés|Unzureichende Nachbeobachtung|Suivi insuffisant|追跡期間不足
ordinal|Original reply ordinal|Eredeti válaszsorszám|Ursprüngliche Antwortposition|Rang original de réponse|元の応答順序
medianCodeShare|Median code share|Kódarány mediánja|Median des Codeanteils|Part médiane de code|コード割合の中央値
partialMessages|Partial messages|Részleges üzenetek|Teilnachrichten|Messages partiels|部分メッセージ
filteredGaps|Filtered gaps|Szűrt hézagok|Filterlücken|Écarts filtrés|フィルターの間隔
orderingProvenance|Ordering provenance|Sorrend eredete|Reihenfolgeprovenienz|Provenance de l’ordre|順序の来歴
ordering|Recorded ordering|Rögzített sorrend|Erfasste Reihenfolge|Ordre enregistré|記録された順序
xSum|X volume sum|X mennyiségi összeg|X-Volumensumme|Somme du volume X|X 量の合計
ySum|Y volume sum|Y mennyiségi összeg|Y-Volumensumme|Somme du volume Y|Y 量の合計
representation|Retained representation|Megőrzött reprezentáció|Erhaltene Darstellung|Représentation conservée|保存された表現
ratioEligible|Ratio-eligible units|Arányhoz jogosult egységek|Für Verhältnis geeignete Einheiten|Unités éligibles au rapport|比率の対象単位
traceSum|Original trace sum|Eredeti gondolatmenet összege|Summe originaler Gedankengänge|Somme des traces originales|元の思考記録の合計
responseSum|Final-response sum|Végső válasz összege|Endantwortsumme|Somme des réponses finales|最終応答の合計
ratioOfSums|Ratio of sums|Összegek aránya|Verhältnis der Summen|Rapport des sommes|合計の比率
ratioMedian|Median individual ratio|Egyéni arány mediánja|Median des Einzelverhältnisses|Rapport individuel médian|個別比率の中央値
ratioQ1|Individual ratio Q1|Egyéni arány Q1|Einzelverhältnis Q1|Rapport individuel Q1|個別比率 Q1
ratioQ3|Individual ratio Q3|Egyéni arány Q3|Einzelverhältnis Q3|Rapport individuel Q3|個別比率 Q3
feature|Content feature|Tartalmi jellemző|Inhaltsmerkmal|Structure de contenu|内容の特徴
prevalence|Presence rate|Jelenléti arány|Präsenzrate|Taux de présence|有無の率
occurrences|Occurrence count|Előfordulásszám|Vorkommensanzahl|Nombre d’occurrences|出現数
joint|Joint presence|Közös jelenlét|Gemeinsame Präsenz|Présence commune|共通の有無
union|Union population|Unió sokasága|Vereinigungspopulation|Population de l’union|和集合の母集団
jaccard|Jaccard joint/union|Jaccard közös/unió|Jaccard Schnitt/Vereinigung|Jaccard intersection/union|Jaccard 共通・和集合
target|Target|Cél|Ziel|Cible|対象
source|Source|Forrás|Quelle|Source|ソース
channel|Reference channel|Hivatkozási csatorna|Referenzkanal|Canal de référence|参照チャネル
domain|Domain|Domain|Domain|Domaine|ドメイン
distinctURLs|Distinct URLs|Különálló URL-ek|Verschiedene URLs|URL distinctes|異なる URL
distinctDomains|Distinct domains|Különálló domainek|Verschiedene Domains|Domaines distincts|異なるドメイン
presentSegments|Segments containing structure|Szerkezetet tartalmazó szegmensek|Segmente mit Struktur|Segments contenant la structure|構造を含むセグメント
eligibleSegments|Eligible segments|Jogosult szegmensek|Geeignete Segmente|Segments éligibles|対象セグメント
presenceFraction|Segment presence fraction|Szegmensjelenlét aránya|Segmentpräsenzanteil|Fraction de présence par segment|セグメント内の有無の割合
node|Retained node|Megőrzött csomópont|Erhaltener Knoten|Nœud conservé|保存されたノード
position|Original position|Eredeti helyzet|Ursprüngliche Position|Position originale|元の位置
lane|Category lane|Kategóriasáv|Kategoriespur|Voie de catégorie|カテゴリのレーン
filteredSegments|Filtered segments|Kiszűrt szegmensek|Gefilterte Segmente|Segments filtrés|フィルター除外セグメント
support|Supporting observations|Alátámasztó megfigyelések|Stützende Beobachtungen|Observations de soutien|根拠の観測値
nodes|Retained nodes|Megőrzött csomópontok|Erhaltene Knoten|Nœuds conservés|保存されたノード
selectedNodes|Selected nodes|Kiválasztott csomópontok|Ausgewählte Knoten|Nœuds sélectionnés|選択ノード
messageObjects|Message objects|Üzenetobjektumok|Nachrichtenobjekte|Objets message|メッセージオブジェクト
nonMessageNodes|Non-message nodes|Nem üzenet csomópontok|Nicht-Nachrichtenknoten|Nœuds non-message|メッセージ以外のノード
missingParents|Missing parents|Hiányzó szülők|Fehlende Eltern|Parents manquants|親の欠落
cycleAffectedNodes|Cycle-affected nodes|Ciklussal érintett csomópontok|Von Zyklen betroffene Knoten|Nœuds affectés par cycles|循環のあるノード
hasMessage|Retained message present|Megőrzött üzenet jelen van|Erhaltene Nachricht vorhanden|Message conservé présent|保存されたメッセージの有無
depthUnit|Verified depth unit|Igazolt mélységegység|Verifizierte Tiefeneinheit|Unité de profondeur vérifiée|検証された深さの単位
maxDepth|Maximum verified depth|Maximális igazolt mélység|Maximale verifizierte Tiefe|Profondeur vérifiée maximale|検証された最大深さ
alternativeNodes|Alternative nodes|Alternatív csomópontok|Alternative Knoten|Nœuds alternatifs|代替ノード
alternativeVersions|Alternative versions|Alternatív verziók|Alternative Versionen|Versions alternatives|代替バージョン
branchPoints|Verified branch points|Igazolt elágazási pontok|Verifizierte Verzweigungspunkte|Points de branchement vérifiés|検証された分岐点
alternativeSegments|Alternative segments|Alternatív szegmensek|Alternative Segmente|Segments alternatifs|代替セグメント
retainedSegments|All retained segments|Minden megőrzött szegmens|Alle erhaltenen Segmente|Tous les segments conservés|全保存セグメント
alternativeShare|Alternative segment share|Alternatív szegmensek aránya|Anteil alternativer Segmente|Part des segments alternatifs|代替セグメントの割合
observedSelectedSegments|Observed selected segments|Megfigyelt kiválasztott szegmensek|Beobachtete ausgewählte Segmente|Segments sélectionnés observés|観測された選択セグメント
outputs|Retained output bucket|Megőrzött kimenet kategóriája|Klasse erhaltener Ausgaben|Classe des sorties conservées|保存出力の区分
matchedOutputs|Matching retained outputs|Illeszkedő megőrzött kimenetek|Passende erhaltene Ausgaben|Sorties conservées associées|対応する保存出力
intervalKind|Verified interval kind|Igazolt időköztípus|Verifizierte Intervallart|Type d’intervalle vérifié|検証された区間種別
recordedTasks|Recorded tasks|Rögzített feladatok|Erfasste Aufgaben|Tâches enregistrées|記録されたタスク
maxConcurrentTasks|Maximum concurrent recorded tasks|Egyidejű rögzített feladatok maximuma|Maximale gleichzeitige erfasste Aufgaben|Maximum de tâches enregistrées simultanées|記録された同時タスク数の最大値
meaning|Verified field meaning|Igazolt mezőjelentés|Verifizierte Feldbedeutung|Sens vérifié du champ|検証されたフィールドの意味
request|Request usage identity|Kérés használati azonosítója|Nutzungsidentität der Anfrage|Identité d’utilisation de requête|要求の使用量 ID
input|Recorded input tokens|Rögzített bemeneti tokenek|Erfasste Eingabetokens|Tokens d’entrée enregistrés|記録された入力トークン
output|Recorded output tokens|Rögzített kimeneti tokenek|Erfasste Ausgabetokens|Tokens de sortie enregistrés|記録された出力トークン
observation|Scoped observation|Hatókörbeli megfigyelés|Beobachtung im Geltungsbereich|Observation dans le périmètre|範囲内の観測
maxContextLength|Supplied positive context limit|Megadott pozitív kontextuslimit|Gelieferte positive Kontextgrenze|Limite positive de contexte fournie|供給された正のコンテキスト上限
exceedsSuppliedLimit|Exceeds supplied limit|Meghaladja a megadott limitet|Überschreitet gelieferte Grenze|Dépasse la limite fournie|供給された上限を超える
key|Aligned category key|Igazított kategóriakulcs|Gemeinsamer Kategorieschlüssel|Clé de catégorie alignée|共通のカテゴリキー
delta|Signed B−A|Előjeles B−A|Vorzeichenbehaftetes B−A|B−A signé|符号付き B−A
relative|Relative change (positive A only)|Relatív változás (csak pozitív A)|Relative Änderung (nur A positiv)|Variation relative (A positif seulement)|相対変化（A が正の場合のみ）
quantile|Quantile probability|Kvantilis valószínűsége|Quantilwahrscheinlichkeit|Probabilité quantile|分位確率
shift|Signed quantile shift|Előjeles kvantiliseltolódás|Vorzeichenbehaftete Quantilverschiebung|Décalage quantile signé|符号付き分位点変化
lens|Identity lens|Azonosítónézet|Identitätsansicht|Vue d’identité|識別情報の単位
region|Intersection region|Metszet régiója|Schnittmengenbereich|Région d’intersection|共通部分の領域
component|Additive component|Összeadható összetevő|Additive Komponente|Composante additive|加算成分
contribution|Signed contribution|Előjeles hozzájárulás|Vorzeichenbehafteter Beitrag|Contribution signée|符号付き寄与
eligibleDelta|Eligibility B−A|Jogosultság B−A|Eignung B−A|Éligibilité B−A|対象件数 B−A
availableDelta|Availability B−A|Elérhetőség B−A|Verfügbarkeit B−A|Disponibilité B−A|利用可能件数 B−A
reason|Availability reason|Elérhetőség oka|Verfügbarkeitsgrund|Motif de disponibilité|利用可能性の理由
level|Diagnostic counting level|Diagnosztikai számlálás szintje|Diagnose-Zählebene|Niveau de comptage diagnostic|診断の集計レベル
originalLabels|Original representation observations|Eredeti reprezentáció megfigyelései|Beobachtungen originaler Darstellung|Observations de représentation originale|元の表現の観測
retainedLabels|Retained representation observations|Megőrzött reprezentáció megfigyelései|Beobachtungen erhaltener Darstellung|Observations de représentation conservée|保存表現の観測
otherLabels|Other representation observations|Egyéb reprezentáció megfigyelései|Beobachtungen anderer Darstellung|Observations d’autres représentations|その他の表現の観測
explorer.method01|Observed Unicode code points per segment, or trustworthy logical message. Fixed half-open bins; ECDF counts all lengths at or below each threshold. Partial messages remain labelled.|Megfigyelt Unicode-kódpontok szegmensenként vagy megbízható logikai üzenetenként. Rögzített félig nyílt intervallumok; az ECDF a küszöbnél nem hosszabb adatokat számolja. A részleges üzenetek jelöltek.|Beobachtete Unicode-Codepunkte je Segment oder verlässlicher logischer Nachricht. Feste halboffene Klassen; ECDF zählt Längen bis zum Schwellenwert. Teilnachrichten bleiben gekennzeichnet.|Points de code observés par segment ou message logique fiable. Classes fixes semi-ouvertes ; ECDF compte les longueurs jusqu’au seuil. Les messages partiels restent signalés.|セグメントまたは信頼できる論理メッセージの Unicode コードポイント数です。固定の半開区間を使い、ECDF は各しきい値以下の件数を示します。部分的なメッセージは明示します。
explorer.method02|Groups use the same length unit. Quartiles use R7 interpolation with frequency weights; sample counts and small samples are explicit. Differences do not measure answer quality.|A csoportok azonos hosszegységet használnak. A kvartilisek R7-interpolációval és gyakorisági súllyal számítódnak; a mintaszám és a kis minták láthatók. Az eltérés nem válaszminőség.|Gruppen verwenden dieselbe Längeneinheit. Quartile nutzen R7 mit Häufigkeitsgewichten; Stichprobengröße und kleine Gruppen sind sichtbar. Unterschiede messen keine Antwortqualität.|Même unité dans chaque groupe. Quartiles R7 avec pondération des fréquences ; effectifs et petits échantillons sont explicites. Les écarts ne mesurent pas la qualité.|同じ長さの単位でグループを比較します。四分位数は頻度重み付き R7 補間で計算し、件数と小標本を明示します。差は品質の評価ではありません。
explorer.method03|Distinct conversations are ranked by observed compatible volume. Membership weighting is separate. Cumulative shares require a positive observed total; top 1/5/10% contributions are exact.|Különálló beszélgetések rangsora megfigyelt, összevethető mennyiséggel. A tagsági súly külön szerepel. Kumulatív arányhoz pozitív összeg kell; az első 1/5/10% hozzájárulása pontos.|Verschiedene Gespräche nach beobachtetem kompatiblem Volumen. Mitgliedschaftsgewichtung separat. Kumulative Anteile brauchen eine positive Summe; Beiträge der obersten 1/5/10% sind exakt.|Conversations distinctes classées par volume observé compatible. Pondération des appartenances séparée. Les parts exigent un total positif ; contributions des premiers 1/5/10% exactes.|互換性のある観測量で会話を順位付けします。所属による重みは別に扱います。累積割合には正の合計が必要で、上位 1/5/10% の寄与を示します。
explorer.method04|Retained fenced body sizes use code points or lines. Literal language declarations and unclosed fences remain explicit. Code is never executed and size does not imply complexity.|Megőrzött kódblokktörzs mérete kódpontban vagy sorban. A szó szerinti nyelvjelölés és a lezáratlan blokk jelölt. A kód nem fut le, a méret nem bonyolultság.|Erhaltene Codeblock-Körper in Codepunkten oder Zeilen. Wörtliche Sprachangaben und offene Blöcke bleiben sichtbar. Code wird nicht ausgeführt; Größe bedeutet keine Komplexität.|Corps des blocs conservés en points de code ou lignes. Déclarations littérales et blocs non fermés explicites. Aucun code exécuté ; taille et complexité restent distinctes.|保存されたフェンス付きコード本文をコードポイントまたは行で測ります。言語宣言と未閉鎖フェンスを保持します。コードは実行せず、サイズから複雑さを推定しません。
explorer.method05|Full prompt text uses NFC, collapsed whitespace, trimming and case-sensitive exact matching. Equal text does not merge request identities. Aggregate groups are neutral; wording appears only in evidence.|Teljes kérésszöveg NFC-normalizálással, összevont szóközökkel, levágással és kisbetűérzékeny pontos egyezéssel. Azonos szöveg nem egyesít kérésazonosítókat. Semleges csoportok; szöveg csak a bizonyítékban.|Vollständiger Anfragetext mit NFC, zusammengefassten Leerzeichen, Trimmen und exaktem Vergleich unter Beachtung der Großschreibung. Gleicher Text vereinigt keine Ereignisse. Neutrale Gruppen; Wortlaut nur in Belegen.|Texte complet normalisé NFC, espaces regroupés, bords nettoyés, comparaison exacte sensible à la casse. Même texte ne fusionne pas les événements. Groupes neutres ; texte uniquement dans les preuves.|完全な入力を NFC、空白の統合、前後空白除去、大文字小文字を区別した完全一致で比較します。同じ文でも要求の識別情報は統合しません。文面は根拠の表示でのみ確認できます。
explorer.method06|Deduplicated scoped attachment metadata. Missing bytes are unavailable; explicit zero is valid. Image dimensions require positive width and height. Metadata does not prove accessibility.|Hatókörön belül deduplikált melléklet-metaadat. Hiányzó bájt nem elérhető; kifejezett nulla érvényes. Képmérethez pozitív szélesség és magasság kell. Metaadat nem bizonyít elérhetőséget.|Deduplizierte Anhangsmetadaten im Geltungsbereich. Fehlende Bytes sind unverfügbar; explizite Null ist gültig. Bildabmessungen brauchen positive Breite und Höhe. Metadaten beweisen keine Zugänglichkeit.|Métadonnées dédupliquées dans le périmètre. Octets manquants indisponibles ; zéro explicite valide. Dimensions positives requises. Les métadonnées ne prouvent pas l’accessibilité.|範囲内で重複除去された添付メタデータです。サイズ欠測は利用不可、明示的なゼロは有効です。画像寸法には正の幅と高さが必要です。メタデータはファイルのアクセス可能性を保証しません。
explorer.method07|7 × 24 cells use clock-precision original timestamps in the applied timezone. Grouped objects/messages use one original first-segment anchor established before filtering; day-only dates are excluded.|7 × 24 cella eredeti, óraszintű vagy pontosabb időponttal az alkalmazott időzónában. Csoportosított objektum/üzenet egy eredeti elsőszegmens-horgonyt használ, szűrés előtt. Napszintű dátum kizárt.|7 × 24 Zellen mit ursprünglichen Uhrzeitstempeln in der angewendeten Zeitzone. Gruppierte Objekte/Nachrichten nutzen einen vor der Filterung bestimmten ersten Segmentanker. Reine Tagesdaten ausgeschlossen.|7 × 24 cellules avec horodatages originaux précis dans le fuseau appliqué. Un ancrage original par objet/message avant filtrage. Dates journalières exclues.|適用したタイムゾーンで元の時刻を 7 × 24 セルに集計します。オブジェクトやメッセージはフィルター前の最初のセグメントを 1 回数え、日付だけの記録は除外します。
explorer.method08|Month/year counts and within-year shares use original retained dates. Rates divide by actual calendar days within observed/applied bounds. Missing archive activity is never inferred.|Havi/éves számok és éven belüli arányok eredeti megőrzött dátumokkal. A ráta valódi naptári napokkal oszt a megfigyelt/alkalmazott határokon belül. Hiányzó aktivitás nem becsült.|Monat/Jahr und Jahresanteile mit ursprünglichen erhaltenen Daten. Raten teilen durch tatsächliche Kalendertage innerhalb beobachteter/angewendeter Grenzen. Fehlende Aktivität wird nicht erschlossen.|Comptes mois/année et parts annuelles selon les dates conservées. Taux divisés par les vrais jours calendaires dans les limites observées/appliquées. Aucune activité manquante déduite.|元の日付に基づく月・年の件数と年内割合です。率は観測または適用範囲内の実際の暦日数で割ります。未保存の活動は推定しません。
explorer.method09|Observed active-day runs and intervening empty-day gaps. Boundary runs are censored; missing-date coverage remains visible. Empty archived days do not establish absence of activity.|Megfigyelt aktív napok sorozatai és köztes üres napok szünetei. A határ menti sorozatok cenzoráltak; hiányzó dátumok jelöltek. Üres archivált nap nem bizonyít tétlenséget.|Beobachtete Serien aktiver Tage und dazwischenliegende leere Tage. Randserien sind zensiert; fehlende Daten bleiben sichtbar. Leere Archivtage beweisen keine Inaktivität.|Séries de jours actifs observés et jours vides intermédiaires. Séries aux limites censurées ; dates manquantes visibles. Un jour vide n’établit pas l’inactivité.|観測された活動日の連続と、その間の空白日を測ります。アーカイブ境界は打ち切りとして扱い、欠測日付を示します。保存された活動がない日から実際の不活動は推定しません。
explorer.method10|Cohorts start at the first observed message week, not recorded creation. Later offsets require retained follow-up opportunity through week end. Counts are continuation observations, not retention or churn.|Kohorsz az első megfigyelt üzenet hetétől, nem a létrehozástól. Későbbi eltéréshez a hét végéig megőrzött követési lehetőség kell. Folytatást mér, nem megtartást vagy lemorzsolódást.|Kohorten beginnen mit der ersten beobachteten Nachrichtenwoche, nicht der Erstellung. Spätere Abstände brauchen erhaltene Nachbeobachtung bis zum Wochenende. Fortsetzung, keine Bindung oder Abwanderung.|Cohortes à la première semaine observée, pas à la création. Décalages exigeant une possibilité de suivi jusqu’en fin de semaine. Continuation, pas rétention ni désabonnement.|最初に観測されたメッセージ週から群を作ります。後の週はその終わりまで追跡可能な会話のみ分母に入れます。継続の観測であり、利用者の定着率や離脱率ではありません。
explorer.method11|Trusted logical final replies use original sequence positions established before filtering. Filtered gaps remain gaps. R7 quartiles and sample n appear at every position; no quality inference.|Megbízható logikai végső válaszok eredeti, szűrés előtt megállapított helyzettel. Kiszűrt hézagok megmaradnak. R7-kvartilisek és n minden helyen; nincs minőségkövetkeztetés.|Verlässliche logische Endantworten mit vor der Filterung festgestellten Sequenzpositionen. Filterlücken bleiben Lücken. R7-Quartile und n je Position; keine Qualitätsableitung.|Réponses finales logiques fiables aux positions originales avant filtrage. Les écarts filtrés restent des écarts. Quartiles R7 et n à chaque position ; aucune qualité déduite.|信頼できる論理最終応答を、フィルター前の元の順序位置で集計します。除外された箇所は間隔として残します。各位置で R7 四分位数と件数を示し、品質は推定しません。
explorer.method12|Both endpoints need original clock-precision timestamps and verified native adjacency. Ties and reversed dates are separate. Recorded intervals never represent latency, TTFT or execution time.|Mindkét végpontnak eredeti óraszintű időpont és igazolt eredeti szomszédság kell. Azonos és fordított időpont külön jelölt. Rögzített időköz nem késleltetés, TTFT vagy végrehajtási idő.|Beide Endpunkte brauchen ursprüngliche genaue Zeitstempel und verifizierte native Nachbarschaft. Gleichstände und umgekehrte Daten getrennt. Intervalle sind keine Latenz, TTFT oder Ausführungszeit.|Deux horodatages originaux précis et adjacency native vérifiée. Égalités et inversions séparées. Intervalles enregistrés, jamais latence, TTFT ou temps d’exécution.|両端に元の正確な時刻と検証された隣接関係が必要です。同時刻と逆順は別に示します。記録時刻の間隔を生成遅延、TTFT、実行時間として扱いません。
explorer.method13|Conversation totals require observed user and final-response text. Paired mode requires recorded parent/turn relationships. Fixed density cells retain exact counts and sums; array positions do not establish pairs.|Beszélgetési összeghez megfigyelt felhasználói és végső válaszszöveg kell. Páros nézethez rögzített szülő/forduló kapcsolat kell. Sűrűségcellák pontos számokkal; tömbhely nem párosítás.|Gesprächssummen brauchen beobachteten Benutzer- und Endantworttext. Paare erfordern erfasste Eltern-/Rundenbeziehungen. Feste Dichtezellen mit exakten Summen; Arraypositionen bilden keine Paare.|Totaux exigeant texte utilisateur et réponse finale observés. Paires exigeant parents/tours enregistrés. Classes de densité avec comptes et sommes exacts ; positions insuffisantes.|会話合計には観測されたユーザー入力と最終応答の両方が必要です。ペア表示には記録された親子またはターン関係が必要です。密度セルは正確な件数と合計を保持します。
explorer.method14|Observed original trace is separate from summary-only thinking and unavailable/redacted content. Ratio of sums and quantiles of individual ratios stay separate. No hidden-effort or compute interpretation.|Megfigyelt eredeti gondolatmenet külön a csak összefoglalótól és hiányzó/kitakart tartalomtól. Összegek aránya és egyéni arányok kvantilise külön. Nincs rejtett erőfeszítés- vagy számításbecslés.|Originaler beobachteter Gedankengang getrennt von Zusammenfassungen und fehlendem/geschwärztem Inhalt. Summenverhältnis und Einzelquotilquantile separat. Keine versteckte Rechenaufwandsdeutung.|Trace originale séparée des résumés et du contenu absent/masqué. Rapport des sommes séparé des quantiles de rapports individuels. Aucun effort caché ni calcul interprété.|元の観測された思考記録を要約のみの思考や伏字と分けます。合計の比率と個別比率の分位点は別です。隠れた努力量や計算量は推定しません。
explorer.method15|Each eligible logical final reply contributes once to feature presence; occurrence totals are separate. Missing attachment metadata is unknown unless metadata completeness is recorded. Numerators and denominators remain exact.|Minden jogosult logikai végső válasz egyszer számít a jellemző jelenlétébe; előfordulás külön. Hiányzó melléklet-metaadat ismeretlen, ha teljessége nem rögzített. Számláló és nevező pontos.|Jede geeignete logische Endantwort zählt einmal für Merkmalspräsenz; Häufigkeiten separat. Fehlende Anhangsdaten unbekannt ohne erfasste Vollständigkeit. Exakte Zähler und Nenner.|Chaque réponse finale logique compte une fois par présence ; occurrences séparées. Métadonnées absentes inconnues sans complétude enregistrée. Numérateurs et dénominateurs exacts.|対象の論理最終応答は特徴の有無につき 1 回数え、発生回数とは別に扱います。完全性が記録されていない添付の欠測は不明です。分子と分母を示します。
explorer.method16|Co-presence uses distinct qualifying conversation sets. Model and declared-language matrices remain separate. Repeated blocks do not multiply presence; Jaccard is joint/union, with explicit aliases only.|Együttelőfordulás különálló jogosult beszélgetéshalmazokból. Modell- és deklarált nyelvmátrix külön. Ismételt blokkok nem szorozzák a jelenlétet; Jaccard közös/unió, csak explicit álnévvel.|Kopräsenz aus verschiedenen geeigneten Gesprächsmengen. Modell- und Sprachmatrizen getrennt. Wiederholte Blöcke erhöhen Präsenz nicht; Jaccard Schnitt/Vereinigung, nur explizite Aliase.|Coprésence par ensembles de conversations distinctes. Matrices modèles/langages séparées. Blocs répétés sans multiplication ; Jaccard intersection/union, alias explicites uniquement.|異なる対象会話の集合で共起を測り、モデル行列と言語行列を分けます。同じブロックの反復は有無の件数を増やしません。Jaccard は共通集合と和集合の比です。
explorer.method17|Textual links, structured references and unlinked citation markers are separate channels. HTTP(S) URLs are normalized and deduplicated across channels within each object. Domains do not imply visits or credibility.|Szöveges link, strukturált hivatkozás és URL nélküli jel külön csatorna. HTTP(S) URL normalizált és objektumon belül csatornák között deduplikált. Domain nem látogatás vagy hitelesség.|Textlinks, strukturierte Referenzen und URL-lose Zitatmarker getrennt. HTTP(S)-URLs normalisiert und objektweise kanalübergreifend dedupliziert. Domains bedeuten keine Besuche oder Glaubwürdigkeit.|Liens textuels, références structurées et marqueurs sans URL séparés. URL HTTP(S) normalisées et dédupliquées par objet entre canaux. Domaines sans preuve de visite ni crédibilité.|本文リンク、構造化参照、URL のない引用マーカーを分けます。HTTP(S) URL は正規化し、各オブジェクト内でチャネルを横断して重複除去します。ドメインから訪問や信頼性は推定しません。
explorer.method18|Complete owned text uses the supported CommonMark/GFM parser. Structure occurrences and segment presence are distinct. Parser failures and bounded input remain unavailable; original text stays unchanged.|Teljes saját szöveg támogatott CommonMark/GFM-elemzővel. Szerkezeti előfordulás és szegmensjelenlét külön. Elemzési hiba és korlátozott bemenet nem elérhető; eredeti szöveg változatlan.|Vollständiger eigener Text mit CommonMark/GFM-Parser. Strukturhäufigkeit und Segmentpräsenz getrennt. Parserfehler und begrenzte Eingaben unverfügbar; Originaltext bleibt unverändert.|Texte complet avec analyseur CommonMark/GFM. Occurrences et présence par segment distinctes. Échecs et limites indisponibles ; texte original inchangé.|所有する完全なテキストを CommonMark/GFM パーサーで解析します。構造の発生数とセグメント内の有無は別です。失敗や処理上限は利用不可として示し、元のテキストは変えません。
explorer.method19|Lanes preserve source object/logical grouping and original path order. Native model transitions require recorded reply relationships. Unknown ordering and filtered gaps remain labelled; legacy filtered modelChanges remains separate.|Sávok az eredeti objektum/logikai csoportot és útvonalsorrendet őrzik. Eredeti modellátmenethez rögzített válaszkapcsolat kell. Ismeretlen sorrend és szűrt hézag jelölt; régi modelChanges külön.|Spuren erhalten Objekt-/Nachrichtengruppierung und ursprüngliche Pfadreihenfolge. Native Modellwechsel brauchen erfasste Antwortbeziehungen. Unbekannte Reihenfolge und Filterlücken markiert; altes modelChanges separat.|Voies conservant groupes et ordre du parcours original. Transitions natives exigeant relations enregistrées. Ordre inconnu et écarts filtrés signalés ; ancien modelChanges séparé.|元のオブジェクト・論理グループと経路順序を保持します。ネイティブなモデル遷移には応答関係の記録が必要です。不明な順序やフィルター間隔を示し、従来指標と分けます。
explorer.method20|Retained nodes and variants distinguish selected and alternative content. Missing parents, non-message parents and partial graphs remain explicit. Versions do not represent extra requests or retry cost.|Megőrzött csomópont és változat kiválasztott/alternatív tartalommal. Hiányzó vagy nem üzenet szülő és részleges gráf jelölt. Verzió nem új kérés vagy újrapróbálási költség.|Erhaltene Knoten/Varianten unterscheiden ausgewählten und alternativen Inhalt. Fehlende/nicht nachrichtenartige Eltern und Teilgraphen sichtbar. Versionen sind keine Zusatzanfragen oder Wiederholungskosten.|Nœuds et variantes distinguant contenu sélectionné et alternatif. Parents manquants/non-messages et graphes partiels explicites. Versions sans demandes ni coûts supplémentaires.|保存されたノードと版を選択・代替内容に分けます。親の欠落、メッセージ以外の親、部分グラフを明示します。版は追加の要求や再試行コストを意味しません。
explorer.method21|Depth uses verified source topology only; incompatible depth units are separated. Alternative-node relationships retain all-retained structural scope. Missing links do not become fabricated branching factors.|Mélység csak igazolt forrástopológiából; eltérő mélységegységek külön. Alternatív csomópontok teljes megőrzött szerkezeti körrel. Hiányzó kapcsolatból nem lesz kitalált elágazási tényező.|Tiefe nur aus verifizierter Quelltopologie; unverträgliche Einheiten getrennt. Alternativen mit gesamter erhaltener Struktur. Fehlende Links ergeben keine erfundenen Verzweigungsfaktoren.|Profondeur selon topologie vérifiée, unités incompatibles séparées. Alternatives dans toute la structure conservée. Liens absents sans facteurs de branchement inventés.|深さは検証されたソース構造に基づき、互換性のない単位を分けます。代替ノードとの関係は全保存構造で示します。欠落リンクから分岐率は作りません。
explorer.method22|Distinct scoped call IDs associate zero, one or multiple retained outputs. Unmatched outputs stay separate. Selected-only versus retained conversation context is visible; missing output is not failure.|Hatókörbeli külön hívásazonosítókhoz nulla, egy vagy több kimenet. Pár nélküli kimenet külön. Kiválasztott kontra teljes beszélgetési kör látható; hiányzó kimenet nem hiba.|Verschiedene Aufruf-IDs im Geltungsbereich mit null/einer/mehreren Ausgaben. Unzugeordnete Ausgaben getrennt. Auswahl versus Gesprächskontext sichtbar; fehlende Ausgabe ist kein Fehler.|ID d’appels distincts associés à zéro/une/plusieurs sorties. Sorties sans correspondance séparées. Périmètre sélection/conversation visible ; sortie absente n’est pas un échec.|範囲内の異なる呼び出し ID を保存された 0/1/複数出力に関連付けます。対応しない出力は別です。選択のみか会話全体かを示し、出力欠落を失敗と判定しません。
explorer.method23|Recorded durations require verified units and scope. Event, source and recap durations are separate. Lifecycle lanes require meaningful endpoints and task identity; message gaps do not establish execution.|Rögzített időtartamhoz igazolt egység és kör kell. Esemény-, forrás- és összefoglalási idő külön. Életciklushoz értelmes végpont és feladatazonosító kell; üzenetköz nem végrehajtás.|Erfasste Dauern brauchen verifizierte Einheiten und Geltungsbereich. Ereignis-, Quell- und Recap-Dauern getrennt. Lebenszyklus braucht Endpunkte und Aufgabenidentität; Nachrichtenlücken sind keine Ausführung.|Durées avec unités et périmètre vérifiés. Durées événement/source/récapitulatif séparées. Cycle exigeant extrémités et tâche identifiée ; intervalles entre messages ne prouvent pas l’exécution.|時間には検証された単位と範囲が必要です。イベント、ソース、要約の時間を分けます。ライフサイクルには意味のある開始・終了とタスク ID が必要で、メッセージ間隔から実行を推定しません。
explorer.method24|Usage pairing requires same-object identity and audited request semantics. Input/output/cached/reasoning fields may overlap. Context occupancy is supplied total/positive limit; no billing or token estimation.|Használatpárosításhoz azonos objektum és ellenőrzött kérésjelentés kell. Bemenet/kimenet/gyorsítótár/gondolatmenet átfedhet. Kontextusarány megadott összeg/pozitív limit; nincs számlázás vagy tokenbecslés.|Nutzungspaare mit gleicher Objektidentität und geprüfter Anfragesemantik. Eingabe/Ausgabe/Cache/Denken können überlappen. Kontextanteil aus gelieferten Werten; keine Abrechnung oder Tokenschätzung.|Paires d’utilisation avec même objet et sémantique vérifiée. Champs pouvant se chevaucher. Occupation du contexte = total/limite positive fournis ; aucune facturation ni estimation.|使用量の組には同じオブジェクト ID と検証された意味が必要です。入力、出力、キャッシュ、思考項目は重複し得ます。コンテキスト割合は供給された合計と正の上限から計算し、課金は推定しません。
explorer.method25|A and B use common keys and bin edges. Difference is signed B−A; relative change requires a positive baseline. Both selection populations and unavailable coverage remain explicit.|A és B közös kulcsokkal és intervallumhatárokkal. Eltérés előjeles B−A; relatív változáshoz pozitív alap kell. Mindkét sokaság és hiányzó lefedettség látható.|A/B mit gleichen Schlüsseln und Klassengrenzen. Differenz vorzeichenbehaftet B−A; relative Änderung braucht positive Basis. Beide Populationen und fehlende Abdeckung sichtbar.|A/B avec clés et classes communes. Différence signée B−A ; variation relative exigeant base positive. Populations et données indisponibles explicites.|A/B を共通キーとビン境界で比較します。差は符号付き B−A、相対変化には正の基準値が必要です。両選択の母集団と欠測を示します。
explorer.method26|Histogram/ECDF overlays share bins and units. Quantile shifts are Q_B(p)−Q_A(p), using the same R7 method. Archive selections are not assumed random samples; no automatic significance claims.|Hisztogram/ECDF azonos intervallummal és egységgel. Kvantiliseltolódás Q_B(p)−Q_A(p), azonos R7-módszerrel. Archívum nem véletlen minta; nincs automatikus szignifikancia.|Histogramm/ECDF mit gleichen Klassen und Einheiten. Quantilverschiebung Q_B(p)−Q_A(p), dieselbe R7-Methode. Archiv nicht als Zufallsstichprobe; keine automatische Signifikanz.|Histogrammes/ECDF mêmes classes et unités. Décalage Q_B(p)−Q_A(p) avec même R7. Archives sans hypothèse d’échantillon aléatoire ; aucune significativité automatique.|ヒストグラムと ECDF は同じビン・単位を使い、分位点差 Q_B(p)−Q_A(p) を同じ R7 法で計算します。アーカイブを無作為標本と仮定せず、有意差を自動判定しません。
explorer.method27|Scoped identity overlap is distinct from explicit alias and exact-prompt-hash lenses. Equal prompt text across providers does not establish the same request event.|Hatókörbeli azonosítómetszet külön explicit álnévtől és pontos kérés-hash nézettől. Szolgáltatók közötti azonos szöveg nem ugyanaz a kérésesemény.|Identitätsüberlappung getrennt von expliziten Aliasen und exakten Anfrage-Hashes. Gleicher Text bei verschiedenen Anbietern bedeutet nicht dasselbe Ereignis.|Chevauchement d’identités distinct des alias et hachages exacts. Même texte entre fournisseurs n’établit pas le même événement.|識別情報の共通部分を、明示的な別名や同一入力ハッシュと分けます。別プロバイダーの同じ入力文は同じ要求イベントを意味しません。
explorer.method28|Signed additive components reconcile to total B−A, including Unknown/Other. Medians and percentages are not decomposed as additive totals. Contributions explain arithmetic, not causation.|Előjeles összeadható elemek összege teljes B−A, Ismeretlen/Egyéb értékkel. Medián és százalék nem additív összeg. Hozzájárulás számtani, nem oksági.|Vorzeichenbehaftete additive Komponenten ergeben B−A einschließlich Unbekannt/Andere. Mediane/Prozente nicht additiv zerlegt. Beiträge erklären Arithmetik, keine Ursache.|Composants additifs signés réconciliés à B−A, Inconnu/Autre inclus. Médianes/pourcentages non décomposés en sommes. Arithmétique, pas causalité.|不明・その他を含む符号付き加算成分の合計を B−A に一致させます。中央値や割合は加算分解しません。寄与は算術であり、因果関係ではありません。
explorer.method29|Availability is specific to source/format/provider and measurement observation unit. Available/eligible counts and record/pair-level limitations are explicit; conversation capability flags do not prove completeness.|Elérhetőség forrás/formátum/szolgáltató és mérési egység szerint. Elérhető/jogosult szám és rekord/pár korlát látható; beszélgetési képességjelző nem teljességbizonyíték.|Verfügbarkeit nach Quelle/Format/Anbieter und Einheit. Verfügbare/geeignete Zahlen und Datensatz-/Paargrenzen sichtbar; Gesprächsfähigkeitsflags beweisen keine Vollständigkeit.|Disponibilité par source/format/fournisseur et unité. Comptes disponible/éligible et limites par enregistrement/paire ; indicateurs sans preuve de complétude.|利用可能性をソース、形式、プロバイダー、観測単位ごとに示します。利用可能・対象件数とレコード・ペアの制限を明示します。会話の機能フラグだけで完全性は判断しません。
explorer.method30|Missing parents, invalid dates, unknown items and normalized-only coverage use explicit linked record counts only where trustworthy. Otherwise counts remain source/conversation-level diagnostics.|Hiányzó szülő, hibás dátum, ismeretlen elem és normalizált-only lefedettség rekordhoz csak megbízható kapcsolattal számítódik. Egyébként forrás/beszélgetési diagnosztika.|Fehlende Eltern, ungültige Daten, unbekannte Elemente und nur-normalisierte Abdeckung mit verlässlich zugeordneten Datensätzen. Sonst Diagnose auf Quellen-/Gesprächsebene.|Parents absents, dates invalides, éléments inconnus et couverture normalisée avec comptes liés fiables. Sinon diagnostics au niveau source/conversation.|親の欠落、不正日付、不明項目、正規化のみの状態は、明確に対応付けられたレコードだけを数えます。それ以外はソース・会話単位の診断として示します。
explorer.method31|A/B values and available/eligible populations use matching scopes. Coverage changes are shown alongside metric deltas so representation changes remain visible without a causal claim.|A/B érték és elérhető/jogosult sokaság azonos körrel. Lefedettségváltozás a mérőszámeltérés mellett, hogy a reprezentáció változása oksági állítás nélkül látható legyen.|A/B und verfügbare/geeignete Populationen mit gleichem Geltungsbereich. Abdeckungsänderungen neben Messwertdeltas zeigen Darstellungsänderungen ohne Kausalbehauptung.|Valeurs A/B et populations dans les mêmes périmètres. Couverture avec écarts pour montrer les changements de représentation sans causalité.|A/B の値と利用可能・対象母集団を同じ範囲で比較します。指標差と網羅率差を並べ、表現の変化を因果主張なしに示します。
explorer.method32|Optional immutable capture history is disabled by default and bounded. Diffs use scoped identities, original hashes and capture provenance. Active captures and the legacy rollback baseline are preserved; unretained history cannot be reconstructed.|Választható változtathatatlan felvételtörténet alapból kikapcsolt és korlátos. Különbség hatókörös azonosítóval, eredeti hash-sel és eredettel. Aktív felvétel és régi visszaállítás megmarad; nem mentett történet nem rekonstruálható.|Optionaler unveränderlicher Verlauf standardmäßig aus und begrenzt. Diffs mit Identitäten, Originalhashes und Provenienz. Aktive Erfassung und alte Rückfallbasis erhalten; nicht gespeicherter Verlauf nicht rekonstruierbar.|Historique facultatif immuable désactivé et limité. Différences avec identités, hachages et provenance. Captures actives et base de retour conservées ; historique absent non reconstructible.|任意の不変履歴は初期状態で無効で、上限があります。差分は範囲内の識別情報、元のハッシュ、来歴で比較します。現在のキャプチャと従来復元基準を保持し、未保存の履歴は再構成しません。
explorer.evidenceRule|Each table row resolves only its exact contributing retained records; inspection is explicit and paginated.|Minden táblasor csak a pontosan hozzájáruló megőrzött rekordokat mutatja; megtekintés kifejezett és lapozott.|Jede Tabellenzeile zeigt nur exakt beitragende erhaltene Datensätze; Inspektion ausdrücklich und paginiert.|Chaque ligne résout ses enregistrements contributeurs exacts ; inspection explicite et paginée.|各行の正確な寄与レコードのみを、明示操作とページ分けで表示します。
explorer.originalDates|Original retained message timestamps; capture/import dates are excluded.|Eredeti megőrzött üzenetidőpontok; felvételi/importdátum kizárt.|Ursprüngliche erhaltene Nachrichtenzeitstempel; Erfassungs-/Importdaten ausgeschlossen.|Horodatages originaux conservés ; dates de capture/import exclues.|元の保存されたメッセージ日時です。取得・取り込み日時を除外します。
explorer.datePrecision|Clock/day precision is respected per retained record; clock charts exclude day-only dates.|Óra/nap pontosság rekordonként; óradiagram kizárja a napszintű dátumot.|Uhr-/Tagespräzision je Datensatz; Uhrzeitdiagramme ohne reine Tagesdaten.|Précision heure/jour respectée ; graphiques horaires sans dates journalières.|各記録の時刻・日付精度を尊重し、時間グラフは日付のみの記録を除外します。
explorer.sourceRepresentation|Analytics-owned normalized capture; original/partial/normalized source provenance remains attached to evidence.|Analytics saját normalizált felvétele; eredeti/részleges/normalizált eredet a bizonyítékhoz kötve.|Analytics-eigene normalisierte Erfassung; originale/teilweise/normalisierte Provenienz an Belegen.|Capture normalisée propre à Analytics ; provenance originale/partielle/normalisée liée aux preuves.|Analytics 所有の正規化キャプチャを使い、元・部分・正規化の来歴を根拠に保持します。
explorer.units.length|Unicode code points per selected observation|Unicode-kódpont kiválasztott megfigyelésenként|Unicode-Codepunkte je ausgewählter Beobachtung|Points de code par observation sélectionnée|選択観測単位ごとの Unicode コードポイント
explorer.units.code|Retained fenced blocks; code points or body lines|Megőrzött kódblokkok; kódpont vagy törzssor|Erhaltene Codeblöcke; Codepunkte oder Körperzeilen|Blocs conservés ; points de code ou lignes du corps|保存されたコードブロックのコードポイントまたは行
explorer.units.prompt|Distinct scoped prompt events|Hatókörbeli külön kérésesemények|Verschiedene Anfrageereignisse im Geltungsbereich|Événements de requête distincts dans le périmètre|範囲内の異なる要求イベント
explorer.units.attachment|Distinct scoped attachment metadata observations|Hatókörbeli külön melléklet-metaadatmegfigyelések|Verschiedene Anhangsmetadatenbeobachtungen|Observations distinctes de métadonnées de pièces jointes|範囲内の異なる添付メタデータの観測
explorer.units.day|Observed calendar days|Megfigyelt naptári napok|Beobachtete Kalendertage|Jours calendaires observés|観測された暦日
explorer.units.conversation|Distinct selected conversations|Különálló kiválasztott beszélgetések|Verschiedene ausgewählte Gespräche|Conversations sélectionnées distinctes|異なる選択会話
explorer.units.interval|Milliseconds between original adjacent observations|Milliszekundum eredeti szomszédos megfigyelések között|Millisekunden zwischen ursprünglichen Nachbarbeobachtungen|Millisecondes entre observations originales adjacentes|元の隣接観測間のミリ秒
explorer.units.presence|Presence sets and exact numerator/denominator|Jelenléthalmazok és pontos számláló/nevező|Präsenzmengen und exakter Zähler/Nenner|Ensembles de présence et numérateur/dénominateur exacts|有無の集合と正確な分子・分母
explorer.units.reference|Recorded references and URL-linked domains|Rögzített hivatkozások és URL-hez kapcsolt domainek|Erfasste Referenzen und URL-verknüpfte Domains|Références enregistrées et domaines liés aux URL|記録された参照と URL に基づくドメイン
explorer.units.structure|Retained objects, logical groups and structure occurrences|Megőrzött objektumok, logikai csoportok és szerkezeti előfordulások|Erhaltene Objekte, logische Gruppen und Strukturvorkommen|Objets conservés, groupes logiques et occurrences de structures|保存されたオブジェクト、論理グループ、構造の発生
explorer.units.call|Distinct scoped calls and retained matching outputs|Hatókörbeli külön hívások és illeszkedő kimenetek|Verschiedene Aufrufe und passende erhaltene Ausgaben|Appels distincts et sorties conservées associées|範囲内の異なる呼び出しと対応する出力
explorer.units.duration|Recorded validated duration observations|Rögzített igazolt időtartam-megfigyelések|Erfasste validierte Dauerbeobachtungen|Observations de durées enregistrées validées|記録され検証された時間の観測
explorer.units.usage|Scoped recorded usage/context observations|Hatókörbeli rögzített használati/kontextusmegfigyelések|Erfasste Nutzungs-/Kontextbeobachtungen|Observations enregistrées d’utilisation/contexte|範囲内で記録された使用量・コンテキスト観測
explorer.units.comparison|Compatible A/B populations and supplied units|Összevethető A/B sokaságok és megadott egységek|Kompatible A/B-Populationen und gelieferte Einheiten|Populations A/B compatibles et unités fournies|互換性のある A/B 母集団と供給された単位
explorer.units.history|Immutable capture identities; not activity dates|Változtathatatlan felvételazonosítók; nem aktivitásdátum|Unveränderliche Erfassungsidentitäten; keine Aktivitätsdaten|Identités de captures immuables ; pas des dates d’activité|不変キャプチャの識別情報（活動日時ではありません）
explorer|Explorer|Felfedező|Explorer|Explorateur|エクスプローラー
explorerHelp|Explore distributions, relationships, sequences, comparisons and measurement availability.|Eloszlások, kapcsolatok, sorozatok, összehasonlítások és mérhetőség vizsgálata.|Verteilungen, Zusammenhänge, Sequenzen, Vergleiche und Messbarkeit untersuchen.|Explorez les distributions, relations, séquences, comparaisons et disponibilités.|分布、関係、系列、比較と測定可能性を調べます。
explorer.distributions|Distributions|Eloszlások|Verteilungen|Distributions|分布
explorer.relationships|Relationships|Kapcsolatok|Zusammenhänge|Relations|関係
explorer.sequences|Sequences|Sorozatok|Sequenzen|Séquences|系列
explorer.compare|Compare|Összehasonlítás|Vergleichen|Comparer|比較
explorer.observability|Observability|Mérhetőség|Messbarkeit|Observabilité|観測可能性
explorer.subviews|Explorer views|Felfedező nézetek|Explorer-Ansichten|Vues de l’explorateur|エクスプローラーの表示
explorer.chartSelect|Chart family|Diagramtípus|Diagrammfamilie|Famille de graphiques|グラフの種類
explorer.sharedScope|Charts use the applied shared filters. Local eligibility and additional chart context appear in the measurement contract.|A diagramok az alkalmazott közös szűrőket használják. A mérési leírás jelzi a helyi jogosultságot és a diagram környezetét.|Diagramme verwenden die angewendeten gemeinsamen Filter. Lokale Eignung und zusätzlicher Kontext stehen im Messvertrag.|Les graphiques utilisent les filtres appliqués. Le contrat précise l’éligibilité locale et le contexte supplémentaire.|グラフは適用済みの共通フィルターを使用します。個別の対象条件と範囲は測定定義で示します。
explorer.exactTable|Exact numerical table|Pontos számtáblázat|Exakte Zahlentabelle|Tableau numérique exact|正確な数値表
explorer.copyExact|Copy complete table|Teljes tábla másolása|Vollständige Tabelle kopieren|Copier le tableau complet|表全体をコピー
explorer.visibleLimit|Displayed observations|Megjelenített megfigyelések|Angezeigte Beobachtungen|Observations affichées|表示した観測値
explorer.exactTotals|The table preserves the complete numerical population.|A táblázat a teljes számszerű sokaságot őrzi.|Die Tabelle enthält die vollständige numerische Population.|Le tableau conserve toute la population numérique.|表には完全な数値母集団を保持しています。
explorer.available|Available|Elérhető|Verfügbar|Disponible|利用可能
explorer.unavailable|Unavailable|Nem elérhető|Nicht verfügbar|Indisponible|利用不可
explorer.measurementContract|Measurement, coverage and evidence definition|Mérés, lefedettség és bizonyíték meghatározása|Definition von Messung, Abdeckung und Beleg|Définition de la mesure, couverture et preuve|測定、網羅率、根拠の定義
explorer.emptySelection|No eligible observations in this applied selection.|Nincs jogosult megfigyelés az alkalmazott kiválasztásban.|Keine geeigneten Beobachtungen in dieser angewendeten Auswahl.|Aucune observation éligible dans cette sélection.|この適用済み選択に対象となる観測値はありません。
explorer.unavailableHelp|Required retained source evidence is unavailable. Missing observations are not zero.|A szükséges megőrzött forrásadat nem érhető el. A hiányzó megfigyelés nem nulla.|Benötigte erhaltene Quellbelege fehlen. Fehlende Beobachtungen sind keine Nullwerte.|Les preuves source nécessaires sont absentes. Une observation manquante n’est pas zéro.|必要な保存済み根拠がありません。欠測はゼロとして扱いません。
explorer.rebuildNeeded|Rebuild derived indexes from the Analytics-owned capture to prepare this measurement.|A méréshez építse újra a származtatott indexeket az Analytics saját felvételéből.|Abgeleitete Indizes aus der Analytics-eigenen Erfassung für diese Messung neu erstellen.|Reconstruisez les index dérivés depuis la capture Analytics pour cette mesure.|Analytics が所有するキャプチャから派生インデックスを再構築してください。
explorer.reasonHelp|Availability follows retained evidence, timestamp precision, trustworthy grouping and recorded relationships.|Az elérhetőség a megőrzött adatoktól, időpontpontosságtól, megbízható csoportosítástól és rögzített kapcsolatoktól függ.|Verfügbarkeit folgt erhaltenen Belegen, Zeitpräzision, verlässlicher Gruppierung und erfassten Beziehungen.|La disponibilité dépend des preuves, de la précision temporelle, du regroupement fiable et des relations enregistrées.|利用可能性は保存された根拠、日時精度、信頼できるグループ化、記録された関係に依存します。
explorer.state.ready|Ready|Kész|Bereit|Prêt|準備完了
explorer.state.partial|Partial|Részleges|Teilweise|Partiel|一部利用可能
explorer.state.unknown|Unknown|Ismeretlen|Unbekannt|Inconnu|不明
explorer.state.unavailable|Unavailable|Nem elérhető|Nicht verfügbar|Indisponible|利用不可
explorer.state.rebuild-needed|Rebuild needed|Újraépítés szükséges|Neuaufbau erforderlich|Reconstruction requise|再構築が必要
explorer.state.rebuildNeeded|Rebuild needed|Újraépítés szükséges|Neuaufbau erforderlich|Reconstruction requise|再構築が必要
explorer.contract.variable|Variable|Változó|Variable|Variable|変数
explorer.contract.observationUnit|Observation unit|Megfigyelési egység|Beobachtungseinheit|Unité d’observation|観測単位
explorer.contract.eligible|Eligible population|Jogosult sokaság|Geeignete Population|Population éligible|対象母集団
explorer.contract.available|Available observations|Elérhető megfigyelések|Verfügbare Beobachtungen|Observations disponibles|利用可能な観測値
explorer.contract.unavailable|Unavailable observations|Hiányzó megfigyelések|Fehlende Beobachtungen|Observations indisponibles|利用不可の観測値
explorer.contract.dateBasis|Date basis|Dátumalap|Datumsbasis|Base temporelle|日時の基準
explorer.contract.timeZone|Timezone|Időzóna|Zeitzone|Fuseau horaire|タイムゾーン
explorer.contract.datePrecision|Timestamp precision|Időpont pontossága|Zeitpräzision|Précision temporelle|日時精度
explorer.contract.branchPolicy|Branch policy|Ágkezelés|Zweigrichtlinie|Règle des branches|分岐方針
explorer.contract.perspective|Counting perspective|Számlálási nézőpont|Zählperspektive|Perspective de comptage|集計視点
explorer.contract.sourceRepresentation|Source representation|Forrás reprezentációja|Quelldarstellung|Représentation source|ソースの表現
explorer.contract.reliability|Reliability|Megbízhatóság|Zuverlässigkeit|Fiabilité|信頼性
explorer.contract.algorithmVersion|Algorithm version|Algoritmusverzió|Algorithmusversion|Version de l’algorithme|アルゴリズムのバージョン
explorer.contract.evidenceRule|Evidence selection rule|Bizonyítékkiválasztás szabálya|Belegauswahlregel|Règle de sélection des preuves|根拠の選択規則
explorer.control.category|Content population|Tartalmi sokaság|Inhaltspopulation|Population de contenu|内容の母集団
explorer.control.lengthLens|Counting lens|Számlálási nézet|Zähllinse|Unité de comptage|集計単位
explorer.control.groupBy|Grouping dimension|Csoportosítási dimenzió|Gruppierungsdimension|Dimension de regroupement|グループ化の次元
explorer.control.concentrationUnit|Volume unit|Mennyiségi egység|Volumeneinheit|Unité de volume|量の単位
explorer.control.codeMeasure|Code-block measure|Kódblokkmérték|Codeblock-Maß|Mesure des blocs de code|コードブロックの尺度
explorer.control.attachmentMeasure|Attachment measure|Mellékletmérték|Anhangsmaß|Mesure des pièces jointes|添付の尺度
explorer.control.temporalUnit|Temporal observation unit|Időbeli megfigyelési egység|Zeitliche Beobachtungseinheit|Unité d’observation temporelle|時間観測の単位
explorer.control.seasonalityMeasure|Seasonality measure|Szezonalitási mérték|Saisonalitätsmaß|Mesure saisonnière|季節性の尺度
explorer.control.relationshipLens|Relationship lens|Kapcsolatnézet|Beziehungsansicht|Vue des relations|関係の単位
explorer.control.sequenceScope|Association context|Kapcsolati környezet|Zuordnungskontext|Contexte des associations|関連付けの範囲
explorer.control.cooccurrenceMeasure|Co-occurrence measure|Együttelőfordulási mérték|Kookkurrenzmaß|Mesure de cooccurrence|共起の尺度
explorer.control.comparisonUnit|Comparison unit|Összehasonlítás egysége|Vergleichseinheit|Unité de comparaison|比較の単位
explorer.control.topN|Visible mark limit|Látható jelek korlátja|Grenze sichtbarer Markierungen|Limite des marques visibles|表示マーク数の上限
explorer.control.presentation|Chart presentation|Diagram megjelenítése|Diagrammdarstellung|Présentation graphique|グラフの表示形式
explorer.value.user|User|Felhasználó|Benutzer|Utilisateur|ユーザー
explorer.value.response|Final response|Végső válasz|Endgültige Antwort|Réponse finale|最終応答
explorer.value.trace|Original trace|Eredeti gondolatmenet|Originaler Gedankengang|Trace originale|元の思考記録
explorer.value.summary|Summary-only thinking|Csak összefoglaló gondolatmenet|Nur Denkzusammenfassung|Résumé de réflexion uniquement|思考の要約のみ
explorer.value.segment|Content segments|Tartalmi szegmensek|Inhaltssegmente|Segments de contenu|内容セグメント
explorer.value.logical|Trustworthy logical messages|Megbízható logikai üzenetek|Verlässliche logische Nachrichten|Messages logiques fiables|信頼できる論理メッセージ
explorer.value.object|Original source objects|Eredeti forrásobjektumok|Originale Quellobjekte|Objets source originaux|元のソースオブジェクト
explorer.value.provider|Provider/platform|Szolgáltató/platform|Anbieter/Plattform|Fournisseur/plateforme|プロバイダー・プラットフォーム
explorer.value.model|Recorded model|Rögzített modell|Erfasstes Modell|Modèle enregistré|記録されたモデル
explorer.value.period|Calendar period|Naptári időszak|Kalenderzeitraum|Période calendaire|暦の期間
explorer.value.characters|Unicode code points|Unicode kódpontok|Unicode-Codepunkte|Points de code Unicode|Unicode コードポイント
explorer.value.segments|Content segments|Tartalmi szegmensek|Inhaltssegmente|Segments de contenu|内容セグメント
explorer.value.objects|Source objects|Forrásobjektumok|Quellobjekte|Objets source|ソースオブジェクト
explorer.value.lines|Lines|Sorok|Zeilen|Lignes|行
explorer.value.bytes|Recorded bytes|Rögzített bájtok|Erfasste Bytes|Octets enregistrés|記録されたバイト数
explorer.value.dimensions|Recorded width × height|Rögzített szélesség × magasság|Erfasste Breite × Höhe|Largeur × hauteur enregistrées|記録された幅 × 高さ
explorer.value.aspectRatio|Recorded aspect ratio|Rögzített képarány|Erfasstes Seitenverhältnis|Rapport d’aspect enregistré|記録された縦横比
explorer.value.count|Absolute count|Abszolút darabszám|Absolute Anzahl|Nombre absolu|絶対数
explorer.value.share|Within-period share|Időszakon belüli részarány|Anteil innerhalb des Zeitraums|Part dans la période|期間内の割合
explorer.value.rate|Count per calendar day|Darabszám naptári naponként|Anzahl je Kalendertag|Nombre par jour calendaire|暦日当たりの数
explorer.value.conversation|Conversation totals|Beszélgetési összesítések|Gesprächssummen|Totaux par conversation|会話単位の合計
explorer.value.paired|Recorded prompt/reply pairs|Rögzített kérés/válasz párok|Erfasste Anfrage/Antwort-Paare|Paires requête/réponse enregistrées|記録された入力・応答の組
explorer.value.selected|Selected records|Kiválasztott rekordok|Ausgewählte Datensätze|Enregistrements sélectionnés|選択されたレコード
explorer.value.conversation-context|Retained conversation context|Megőrzött beszélgetési környezet|Erhaltener Gesprächskontext|Contexte de conversation conservé|保存された会話全体の範囲
explorer.value.jaccard|Jaccard joint/union|Jaccard közös/unió|Jaccard Schnittmenge/Vereinigung|Jaccard intersection/union|Jaccard 共通・和集合
explorer.value.conversations|Distinct conversations|Különálló beszélgetések|Verschiedene Gespräche|Conversations distinctes|異なる会話
explorer.value.histogram|Histogram|Hisztogram|Histogramm|Histogramme|ヒストグラム
explorer.value.ecdf|Empirical cumulative distribution|Empirikus kumulatív eloszlás|Empirische kumulative Verteilung|Distribution cumulative empirique|経験累積分布
explorer.value.concentration|Cumulative concentration|Kumulatív koncentráció|Kumulative Konzentration|Concentration cumulative|累積集中度
explorer.value.band|Median and quartile band|Medián és kvartilissáv|Median- und Quartilband|Bande médiane et quartiles|中央値と四分位帯
explorer.value.line|Line plot|Vonaldiagram|Liniendiagramm|Courbe|折れ線グラフ
explorer.savePreset|Save exploration preset|Felfedezési beállítás mentése|Erkundungsvorgabe speichern|Enregistrer une exploration|探索設定を保存
explorer.presets|Exploration presets|Felfedezési beállítások|Erkundungsvorgaben|Explorations enregistrées|探索プリセット
explorer.noPresets|No exploration presets yet.|Még nincs mentett felfedezési beállítás.|Noch keine Erkundungsvorgaben.|Aucune exploration enregistrée.|保存済み探索設定はありません。
explorer.presetHelp|Saves applied filters, chart controls and the explicitly applied comparison separately from legacy saved views.|Az alkalmazott szűrőket, diagrambeállításokat és az alkalmazott összehasonlítást a régi mentett nézetektől külön menti.|Speichert angewendete Filter, Diagrammsteuerung und den angewendeten Vergleich getrennt von alten Ansichten.|Enregistre filtres, réglages et comparaison appliquée séparément des anciennes vues.|適用済みフィルター、グラフ設定、比較を従来の保存ビューと別に保存します。
explorer.appliedComparison|Two applied selections|Két alkalmazott kiválasztás|Zwei angewendete Auswahlen|Deux sélections appliquées|2 つの適用済み選択
explorer.comparisonHelp|Choose A and B, then apply both. Draft changes do not alter exported comparisons.|Válassza ki A-t és B-t, majd alkalmazza mindkettőt. A vázlat módosítása nem változtatja az exportált összehasonlítást.|A und B wählen, dann beide anwenden. Entwurfsänderungen verändern exportierte Vergleiche nicht.|Choisissez A et B, puis appliquez-les. Les brouillons ne modifient pas les comparaisons exportées.|A と B を選び、両方を適用してください。未適用の変更は比較の出力を変えません。
explorer.applyComparison|Apply A and B|A és B alkalmazása|A und B anwenden|Appliquer A et B|A と B を適用
explorer.comparisonPending|Comparison requires two explicitly applied selections.|Az összehasonlításhoz két kifejezetten alkalmazott kiválasztás kell.|Der Vergleich erfordert zwei ausdrücklich angewendete Auswahlen.|La comparaison exige deux sélections explicitement appliquées.|比較には 2 つの選択を明示的に適用する必要があります。
explorer.indexUnavailable|Explorer indexes are not ready for this capture. Rebuild the owned indexes from Sources & settings.|A felvétel Felfedező-indexei nem készek. Építse újra a saját indexeket a Források és beállítások oldalon.|Explorer-Indizes dieser Erfassung sind nicht bereit. Eigene Indizes unter Quellen und Einstellungen neu erstellen.|Les index ne sont pas prêts. Reconstruisez-les depuis Sources et réglages.|キャプチャのインデックスが準備できていません。ソースと設定から再構築してください。
explorer.openRelated|Explore related measurements|Kapcsolódó mérések vizsgálata|Verwandte Messungen untersuchen|Explorer les mesures liées|関連する測定を調べる
explorer.unknownFilters|Selection partly applied: unsupported saved filter keys were retained but are not evaluated.|A kiválasztás részben alkalmazva: a nem támogatott mentett szűrők megmaradtak, de nincsenek kiértékelve.|Auswahl teilweise angewendet: nicht unterstützte gespeicherte Filter bleiben erhalten, werden aber nicht ausgewertet.|Sélection partiellement appliquée : les filtres non pris en charge sont conservés mais non évalués.|選択は一部適用されています。未対応の保存フィルターは保持されていますが評価されません。
explorer.copyLink|Copy link|Hivatkozás másolása|Link kopieren|Copier le lien|リンクをコピー
explorer.openLink|Open externally|Megnyitás külső böngészőben|Extern öffnen|Ouvrir à l’extérieur|外部ブラウザーで開く
explorer.imageOmitted|Image omitted; no remote content is loaded.|Kép kihagyva; távoli tartalom nem töltődik be.|Bild ausgelassen; keine entfernten Inhalte werden geladen.|Image omise ; aucun contenu distant n’est chargé.|画像は省略されています。外部の内容は読み込みません。
explorer.blockedLink|Unsafe link omitted|Nem biztonságos hivatkozás kihagyva|Unsicherer Link ausgelassen|Lien dangereux omis|安全でないリンクを省略
explorer.includeLabels|Include potentially private chart labels|Lehetséges magánjellegű diagramcímkék hozzáadása|Möglicherweise private Diagrammbeschriftungen einschließen|Inclure les libellés potentiellement privés|個人情報を含み得るグラフラベルを含める
explorer.legacyExport|Legacy-compatible aggregate export (new charts omitted)|Régi változattal kompatibilis összesítő export (új diagramok nélkül)|Alte Version unterstützender Gesamtexport (neue Diagramme ausgelassen)|Export agrégé compatible ancien format (sans nouveaux graphiques)|従来互換の集計出力（新しいグラフを省略）
explorer.captureHistory|Capture history|Felvételtörténet|Erfassungsverlauf|Historique des captures|キャプチャ履歴
explorer.historyHelp|History is optional and disabled by default. Limits apply to immutable prior captures; the active capture and legacy rollback baseline remain preserved. Capture times are not activity dates.|A történet választható, alapértelmezésben kikapcsolt. A korlátok a változtathatatlan korábbi felvételekre érvényesek; az aktív felvétel és a régi visszaállítási alap megmarad. A felvétel ideje nem aktivitási dátum.|Verlauf ist optional und standardmäßig aus. Grenzen betreffen unveränderliche frühere Erfassungen; aktive Erfassung und alte Rückfallbasis bleiben erhalten. Erfassungszeiten sind keine Aktivitätsdaten.|L’historique est facultatif et désactivé par défaut. Les limites concernent les anciennes captures immuables ; capture active et base de retour restent conservées. L’heure de capture n’est pas une date d’activité.|履歴は任意で、初期状態では無効です。制限は過去の不変キャプチャに適用され、現在のキャプチャと従来版への復元基準は保持されます。取得日時は活動日時ではありません。
explorer.historyDisabled|Retained capture history is separate from activity time and the preserved 1.0 rollback baseline.|A megőrzött felvételek története különbözik az aktivitás idejétől és a megőrzött 1.0 visszaállítási alaptól.|Erhaltener Erfassungsverlauf ist getrennt von Aktivitätszeit und erhaltener 1.0-Rückfallbasis.|L’historique est distinct du temps d’activité et de la base de retour 1.0.|保存された履歴は活動時間および 1.0 復元基準とは別です。
explorer.historyEnabled|Retain prior captures after refresh|Korábbi felvételek megőrzése frissítéskor|Frühere Erfassungen nach Aktualisierung behalten|Conserver les captures précédentes à l’actualisation|更新時に過去のキャプチャを保持
explorer.retainedCaptures|Maximum prior captures per source|Korábbi felvételek maximuma forrásonként|Maximale frühere Erfassungen je Quelle|Maximum d’anciennes captures par source|ソースごとの過去キャプチャ数の上限
explorer.historyMegabytes|History storage limit (MiB)|Történet tárhelykorlátja (MiB)|Speichergrenze des Verlaufs (MiB)|Limite de stockage de l’historique (Mio)|履歴容量の上限 (MiB)
explorer.historicalCapture|Prior immutable capture|Korábbi változtathatatlan felvétel|Frühere unveränderliche Erfassung|Ancienne capture immuable|過去の不変キャプチャ
explorer.rollbackBaseline|Preserved 1.0 rollback baseline|Megőrzött 1.0 visszaállítási alap|Erhaltene 1.0-Rückfallbasis|Base de retour 1.0 conservée|保存された 1.0 復元基準
explorer.noHistory|No prior captures were retained. History cannot reconstruct unrecorded captures.|Nem maradt korábbi felvétel. A történet nem állítja elő a nem rögzített felvételeket.|Keine früheren Erfassungen erhalten. Nicht gespeicherte Erfassungen können nicht rekonstruiert werden.|Aucune ancienne capture conservée. Les captures non enregistrées ne peuvent être reconstruites.|過去のキャプチャは保存されていません。保存されなかった履歴は復元できません。
explorer.captureDiff|Scoped capture differences|Hatókörön belüli felvételkülönbségek|Erfassungsunterschiede im Geltungsbereich|Différences de captures dans le périmètre|指定範囲のキャプチャの差分
explorer.storageBreakdown|Owned storage breakdown|Saját tárhely részletezése|Aufteilung des eigenen Speichers|Répartition du stockage propre|所有ストレージの内訳
explorer.storage.totalBytes|Total owned storage|Saját tárhely összesen|Gesamter eigener Speicher|Stockage propre total|所有ストレージ合計
explorer.storage.legacyBytes|Legacy rollback files|Régi visszaállítási fájlok|Alte Rückfalldateien|Fichiers de retour ancien format|従来版の復元ファイル
explorer.storage.captureBytes|Active captures|Aktív felvételek|Aktive Erfassungen|Captures actives|現在のキャプチャ
explorer.storage.historyBytes|Retained history|Megőrzött történet|Erhaltener Verlauf|Historique conservé|保存された履歴
explorer.storage.indexBytes|Derived indexes|Származtatott indexek|Abgeleitete Indizes|Index dérivés|派生インデックス
explorer.storage.stateBytes|State and settings|Állapot és beállítások|Zustand und Einstellungen|État et réglages|状態と設定
explorer.storage.ownedBytes|Owned files|Saját fájlok|Eigene Dateien|Fichiers propres|所有ファイル
explorer.diff.added|Added identities|Hozzáadott azonosítók|Hinzugefügte Identitäten|Identités ajoutées|追加された識別情報
explorer.diff.removed|Removed identities|Eltávolított azonosítók|Entfernte Identitäten|Identités supprimées|削除された識別情報
explorer.diff.changed|Changed identities|Módosult azonosítók|Geänderte Identitäten|Identités modifiées|変更された識別情報
explorer.diff.unchanged|Unchanged identities|Változatlan azonosítók|Unveränderte Identitäten|Identités inchangées|未変更の識別情報
explorer.chart01|Length histogram and ECDF|Hossz hisztogramja és ECDF|Längenhistogramm und ECDF|Histogramme de longueur et ECDF|長さのヒストグラムと ECDF
explorer.chart02|Distribution groups and box plots|Csoportos eloszlások és dobozdiagramok|Verteilungsgruppen und Boxplots|Groupes de distributions et boîtes|グループ別分布と箱ひげ図
explorer.chart03|Conversation concentration|Beszélgetési koncentráció|Gesprächskonzentration|Concentration des conversations|会話の集中度
explorer.chart04|Code-block size by declared language|Kódblokkméret deklarált nyelvenként|Codeblock-Größe nach deklarierter Sprache|Taille des blocs par langage déclaré|宣言言語別のコードブロックサイズ
explorer.chart05|Exact prompt-repeat spectrum|Pontos kérésismétlési spektrum|Spektrum exakter Anfragewiederholungen|Spectre des répétitions exactes|同一入力の反復スペクトル
explorer.chart06|Attachment size and image dimensions|Mellékletméret és képméretek|Anhangsgröße und Bildabmessungen|Taille des pièces jointes et images|添付サイズと画像寸法
explorer.chart07|Weekday × hour heatmap|Hét napja × óra hőtérkép|Wochentag × Stunde Heatmap|Carte jour × heure|曜日 × 時間のヒートマップ
explorer.chart08|Calendar seasonality|Naptári szezonalitás|Kalendersaisonalität|Saisonnalité calendaire|暦上の季節性
explorer.chart09|Observed streaks and gaps|Megfigyelt sorozatok és szünetek|Beobachtete Serien und Lücken|Séries et écarts observés|観測された連続日数と間隔
explorer.chart10|Observed conversation continuation|Megfigyelt beszélgetésfolytatás|Beobachtete Gesprächsfortsetzung|Continuation observée des conversations|観測された会話の継続
explorer.chart11|Response shape by conversation position|Válaszforma a beszélgetésbeli hely szerint|Antwortform nach Gesprächsposition|Forme des réponses par position|会話内の位置別の応答形状
explorer.chart12|Recorded timestamp intervals|Rögzített időpontközök|Erfasste Zeitabstände|Intervalles temporels enregistrés|記録された日時の間隔
explorer.chart13|Prompt volume × reply volume|Kérésmennyiség × válaszmennyiség|Anfragevolumen × Antwortvolumen|Volume des requêtes × réponses|入力量 × 応答量
explorer.chart14|Exported trace × final response|Exportált gondolatmenet × végső válasz|Exportierter Gedankengang × Endantwort|Trace exportée × réponse finale|出力された思考記録 × 最終応答
explorer.chart15|Content-feature prevalence by model|Tartalmi jellemzők gyakorisága modellenként|Inhaltsmerkmale nach Modell|Prévalence des structures par modèle|モデル別の内容特徴の有無
explorer.chart16|Model and code-language co-occurrence|Modell és kódnyelv együttelőfordulása|Modell- und Codesprachenkookkurrenz|Cooccurrence modèles et langages|モデルと言語の共起
explorer.chart17|Reference channels and domain concentration|Hivatkozási csatornák és domainkoncentráció|Referenzkanäle und Domainkonzentration|Canaux de références et concentration|参照チャネルとドメインの集中度
explorer.chart18|Parser-derived Markdown structure|Elemzővel mért Markdown-szerkezet|Parserbasierte Markdown-Struktur|Structure Markdown issue de l’analyse|パーサーによる Markdown 構造
explorer.chart19|Selected-path ladder and model transitions|Kiválasztott útvonal és modellátmenetek|Ausgewählter Pfad und Modellwechsel|Parcours sélectionné et transitions|選択経路とモデル遷移
explorer.chart20|Retained branches and versions|Megőrzött ágak és verziók|Erhaltene Zweige und Versionen|Branches et versions conservées|保存された分岐とバージョン
explorer.chart21|Depth and alternatives relationships|Mélység és alternatívák kapcsolata|Tiefe und Alternativen|Relations profondeur et alternatives|深さと代替経路の関係
explorer.chart22|Call/output association|Hívás/kimenet kapcsolat|Aufruf/Ausgabe-Zuordnung|Association appel/sortie|呼び出しと出力の関連
explorer.chart23|Recorded durations and lifecycle lanes|Rögzített időtartamok és életciklusok|Erfasste Dauern und Lebenszyklusspuren|Durées enregistrées et cycles de vie|記録された時間とライフサイクル
explorer.chart24|Usage and context observations|Használati és kontextusmegfigyelések|Nutzungs- und Kontextbeobachtungen|Observations d’utilisation et contexte|使用量とコンテキストの観測
explorer.chart25|Aligned-bin selection differences|Igazított intervallumok kiválasztási eltérései|Auswahlunterschiede mit gleichen Klassen|Écarts entre classes alignées|同一ビンでの選択差分
explorer.chart26|Distribution and quantile shifts|Eloszlási és kvantiliseltolódások|Verteilungs- und Quantilverschiebungen|Décalages de distributions et quantiles|分布と分位点の変化
explorer.chart27|Selection identity intersections|Kiválasztások azonosítómetszetei|Identitätsschnittmengen der Auswahlen|Intersections d’identités des sélections|選択の識別情報の共通部分
explorer.chart28|Contribution to aggregate change|Hozzájárulás az összesített változáshoz|Beitrag zur Gesamtänderung|Contribution au changement agrégé|集計変化への寄与
explorer.chart29|Metric observability matrix|Mérőszám-mérhetőségi mátrix|Messbarkeitsmatrix|Matrice d’observabilité des mesures|指標の観測可能性行列
explorer.chart30|Diagnostic and representation profile|Diagnosztikai és reprezentációs profil|Diagnose- und Darstellungsprofil|Profil diagnostic et représentation|診断と表現のプロファイル
explorer.chart31|Coverage change alongside metric change|Lefedettségváltozás a mérőszámváltozás mellett|Abdeckungsänderung neben Messwertänderung|Changement de couverture et de mesure|指標の変化と網羅率の変化
explorer.chart32|Source-capture history and differences|Forrásfelvétel-történet és különbségek|Quellerfassungsverlauf und Unterschiede|Historique et différences de captures|ソースのキャプチャ履歴と差分
`;
export const dictionaries = Object.fromEntries(['en','hu','de','fr','ja'].map(l=>[l,{}]));
for(const row of (rows+'\n'+explorerRows).trim().split('\n').filter(row=>row.trim())){const [key,...values]=row.split('|');if(values.length!==5)throw new Error('Translation row '+key);['en','hu','de','fr','ja'].forEach((l,i)=>{dictionaries[l][key]=values[i]});}
export const localeFor = language => ({en:'en-GB',hu:'hu-HU',de:'de-DE',fr:'fr-FR',ja:'ja-JP'}[language]||'en-GB');
export function translator(language){const d=dictionaries[language]||dictionaries.en;return key=>d[key]??key;}

// Exact-table aliases share the same translated schema in GUI and reports.
for(const language of Object.keys(dictionaries)){const d=dictionaries[language];const aliases={kind:'kind',category:'categories',group:'group',conversation:'conversations',dimension:'scope',structure:'structure',field:'name',task:'name',tool:'toolNames',topology:'branches',diagnostic:'diagnosticCode',change:'change',totalTokens:'tokens',scope:'scope',n:'count',q1:'Q1',q3:'Q3'};for(const [field,key] of Object.entries(aliases)){d['explorer.column.'+field]=d[field]??d[key]??key;}for(const field of ['lower', 'upper', 'upperUnbounded', 'population', 'cumulative', 'cumulativeValue', 'cumulativeShare', 'threshold', 'fraction', 'denominator', 'numerator', 'eligible', 'unavailable', 'minimum', 'maximum', 'mean', 'smallSample', 'rank', 'membershipWeight', 'percentage', 'conversationCount', 'closed', 'unclosed', 'literalDeclarations', 'frequency', 'weightedFrequency', 'groups', 'promptOccurrences', 'distinctConversations', 'distinctModels', 'measure', 'width', 'height', 'aspectRatio', 'weekday', 'hour', 'month', 'year', 'calendarDays', 'rate', 'withinYearShare', 'leftCensored', 'rightCensored', 'length', 'cohort', 'weekOffset', 'cohortConversations', 'insufficientFollowup', 'ordinal', 'medianCodeShare', 'partialMessages', 'filteredGaps', 'orderingProvenance', 'ordering', 'xSum', 'ySum', 'representation', 'ratioEligible', 'traceSum', 'responseSum', 'ratioOfSums', 'ratioMedian', 'ratioQ1', 'ratioQ3', 'feature', 'prevalence', 'occurrences', 'joint', 'union', 'jaccard', 'target', 'source', 'channel', 'domain', 'distinctURLs', 'distinctDomains', 'presentSegments', 'eligibleSegments', 'presenceFraction', 'node', 'position', 'lane', 'filteredSegments', 'support', 'nodes', 'selectedNodes', 'messageObjects', 'nonMessageNodes', 'missingParents', 'cycleAffectedNodes', 'hasMessage', 'depthUnit', 'maxDepth', 'alternativeNodes', 'alternativeVersions', 'branchPoints', 'alternativeSegments', 'retainedSegments', 'alternativeShare', 'observedSelectedSegments', 'outputs', 'matchedOutputs', 'intervalKind', 'recordedTasks', 'maxConcurrentTasks', 'meaning', 'request', 'input', 'output', 'observation', 'maxContextLength', 'exceedsSuppliedLimit', 'key', 'delta', 'relative', 'quantile', 'shift', 'lens', 'region', 'component', 'contribution', 'eligibleDelta', 'availableDelta', 'reason', 'level', 'originalLabels', 'retainedLabels', 'otherLabels']){d['explorer.column.'+field]=d[field];}for(const prefix of ['a','b'])for(const [suffix,key]of Object.entries({Available:'available',Eligible:'eligible',Count:'count',Cumulative:'cumulative',Fraction:'fraction',N:'count',Population:'population',Unavailable:'unavailable'})){d['explorer.column.'+prefix+suffix]=prefix.toUpperCase()+' · '+d[key];d[prefix+suffix]=d['explorer.column.'+prefix+suffix];}for(const prefix of ['x','y'])for(const [suffix,key] of Object.entries({Lower:'lower',Upper:'upper',Unbounded:'upperUnbounded'})){d['explorer.column.'+prefix+suffix]=prefix.toUpperCase()+' · '+d[key];d[prefix+suffix]=d['explorer.column.'+prefix+suffix];}d.a='A';d.b='B';}

export function translateExplorerValue(language,value){const t=translator(language),raw=String(value??'');const direct=t('explorer.enum.'+raw);if(direct!=='explorer.enum.'+raw)return direct;const m=/^(Conversation|Node|Task|Item|Request|Context|Source|Prompt group) (\d+)$/.exec(raw);if(m){const key={Conversation:'conversations',Node:'explorer.column.node',Task:'explorer.column.task',Item:'explorer.column.observation',Request:'explorer.column.request',Context:'context',Source:'sources','Prompt group':'explorer.enum.group'}[m[1]];return t(key)+' '+m[2];}return raw;}

for(const language of Object.keys(dictionaries)){const d=dictionaries[language];for(let family=1;family<=18;family++){const unit=['','length','length','length','code','prompt','attachment','length','day','day','conversation','length','interval','conversation','conversation','presence','presence','reference','structure'][family];d['explorer.unit'+String(family).padStart(2,'0')]=d['explorer.units.'+unit];}d['explorer.originalDateBasis']=d['explorer.originalDates'];d['explorer.exactEvidence']=d['explorer.evidenceRule'];for(const [reason,key]of Object.entries({'observed-population':'reasonHelp','required-observation-unavailable':'unavailableHelp','no-matching-observations':'emptySelection','full-text-index-rebuild-needed':'rebuildNeeded'}))d['explorer.reason.'+reason]=d['explorer.'+key];}

for(const language of Object.keys(dictionaries)){const d=dictionaries[language];d['explorer.column.share']=d.share;d['explorer.column.format']=d.formats;d['explorer.column.provider']=d.platform;}
