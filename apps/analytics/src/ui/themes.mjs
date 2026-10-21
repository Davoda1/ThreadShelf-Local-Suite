// Shared, browser-safe theme catalog. No network resources or platform state.
// Default and Modern share Reader 3.1.0's exact base palette. Modern adds paint
// effects only; explicit tokens prevent either theme inheriting Analytics CSS.
const uiNames = ['bg','surface','sidebar','hover','border','text','muted','faint','accent','accent-hover','accent-soft','accent-text','danger','warning','focus','primary-ink','role-assistant'];
const codeNames = ['background','foreground','header','label','border','comment','keyword','string','number','title','type','attribute','variable','meta','operator','selector','addition','addition-background','deletion','deletion-background'];
const tokens = (names, values) => Object.freeze(Object.fromEntries(names.map((name, index) => [name, values[index]])));
const entry = (id, name, swatch, light, dark, names) => Object.freeze({ id, name, swatch,
  tokens: Object.freeze({ light: tokens(names, light), dark: tokens(names, dark) }) });

// Reader src/ui/style.css supplies the first fifteen semantic colors and primary
// button ink. Its src/reader/reader.css supplies the assistant role label colors.
const readerDefault = entry('default', 'Default', '#396a63',
    ['#f5f6f8','#fff','#f0f2f5','#e8ecf1','#dce1e8','#202b3b','#66758a','#8390a1','#396a63','#2b574f','#e2eeea','#244e46','#aa4347','#9a6c25','#548e83','#fff','#29925f'],
    ['#171c24','#1d242e','#19202a','#29323e','#333e4c','#e5eaf0','#9daabc','#78879b','#8ac8b7','#adddce','#29433d','#b6e2d4','#f19a9c','#e4b96e','#8bcbbb','#173129','#89dcac'],uiNames);
const oledPalette = entry('oled', 'OLED', '#171717',
    ['#ffffff','#ffffff','#f3f3f3','#e8e8e8','#c6c6c6','#171717','#555555','#656565','#303030','#101010','#e5e5e5','#242424','#a12b3b','#795600','#3a3a3a','#ffffff','#454545'],
    ['#000000','#0a0a0a','#080808','#171717','#333333','#f5f5f5','#b8b8b8','#a0a0a0','#e5e5e5','#ffffff','#242424','#f0f0f0','#ffabb8','#e6c582','#d9d9d9','#111111','#c6c6c6'],uiNames);

export const UI_PALETTES = Object.freeze([
  Object.freeze({ ...readerDefault, swatch: readerDefault.tokens.light.accent }),
  entry('ocean', 'Ocean', '#3779b9',
    ['#edf4fb','#ffffff','#e4eef8','#dce9f6','#bacddd','#20354c','#526b83','#61768b','#245f9e','#1a4b81','#dceafa','#184c80','#a33340','#805717','#3779b9','#ffffff','#28705e'],
    ['#101e2d','#17283b','#132235','#223b53','#36526d','#e6f0fc','#a8bfd7','#91abc5','#8fc5ff','#b1d7ff','#213f5f','#c3dfff','#ffabb6','#f2c879','#acd3ff','#0f2a48','#8bd9bf'],uiNames),
  entry('forest', 'Forest', '#4e7b43',
    ['#eff5ef','#fbfdf9','#e6eee2','#dfeadb','#bccfb5','#283d29','#546d51','#607a5c','#3f703e','#315b30','#deedd9','#285227','#a63e3f','#7d5d1c','#598851','#ffffff','#476b38'],
    ['#142019','#1d2b20','#18251b','#2b3d2b','#3d5940','#e5efe1','#afc5a6','#94b18b','#a5cf8f','#bfdfa9','#304b2d','#d3efbe','#f1a4a5','#e7c777','#b4df9a','#193110','#b5d99d'],uiNames),
  entry('ember', 'Ember', '#b8663e',
    ['#faf1e9','#fffaf5','#f4e7da','#f0ddcb','#d8bda8','#4b3026','#7d5b49','#88634f','#a74b2a','#893a1e','#f8ddcf','#823918','#b03145','#806111','#b8663e','#ffffff','#636b2b'],
    ['#251a17','#30221c','#2a1e18','#443027','#6c4c3c','#f6e8df','#cfb4a1','#bea08c','#eda77e','#f7c0a0','#593825','#ffd7be','#ffacb6','#edc786','#f2b68f','#382013','#c6d393'],uiNames),
  entry('amethyst', 'Amethyst', '#8263b2',
    ['#f3effa','#fdfbff','#ece5f4','#e5dcf0','#cbbddc','#372c4a','#69567e','#77638b','#755199','#5e3d81','#e9ddf5','#5c397f','#ac3c5e','#805c22','#906db8','#ffffff','#386d65'],
    ['#1e1929','#282135','#231d30','#382d49','#544267','#ede5f8','#bfaed3','#ad98c4','#c5a7e8','#dbc6f4','#47335f','#e6d4ff','#f5a3bc','#e6c582','#d4b7f4','#2f1c45','#99d4c9'],uiNames),
  oledPalette,
  Object.freeze({ ...readerDefault, id: 'modern', name: 'Modern', swatch: readerDefault.tokens.light.accent }),
  Object.freeze({ ...oledPalette, id: 'modern-oled', name: 'Modern OLED' }),
  entry('platinum', 'Platinum', '#9bc9f6',
    ['#f1f3f6','#ffffff','#e9eef4','#e1e8f1','#cdd6e2','#202b3a','#58697e','#596c80','#245b91','#194973','#dfebf8','#194e80','#a52e44','#805a16','#366fa4','#ffffff','#28734f'],
    ['#101319','#191f28','#141922','#252f3d','#354152','#e7edf6','#aab9cc','#92a4be','#9bc9f6','#badcfc','#203750','#c5e2ff','#ffacb7','#edc880','#a4d5ff','#10273d','#9cd5bc'],uiNames),
  entry('vellum', 'Vellum', '#d6b274',
    ['#f3f0e8','#fcfbf7','#eae6dd','#e4ded2','#cfc6b7','#342e28','#6a5f52','#766957','#795628','#62451c','#eae0cc','#65451d','#a23535','#795919','#80613a','#ffffff','#36694e'],
    ['#171612','#211f19','#1c1a16','#302c23','#4b4234','#ece5d9','#bbae9a','#a89a84','#d6b274','#e7c995','#3b3020','#ead0a1','#f2a6a2','#dfb969','#e7c995','#292112','#a5c79e'],uiNames),
  entry('prism', 'Prism', '#c8b6fc',
    ['#f4f4f8','#fdfdff','#ececf4','#e5e5f1','#cdcddf','#29293a','#62627a','#6c6c80','#665098','#513e7f','#e8e1f6','#56417d','#aa345a','#85631b','#7861ab','#ffffff','#296b63'],
    ['#12131b','#1c1d2a','#171822','#2b2c40','#41415c','#edecfa','#bab8d3','#a29ebb','#c8b6fc','#ded2ff','#382d54','#eadbff','#ffb0c8','#e4c28a','#d5c5ff','#2b1d42','#9fdccd'],uiNames),
  entry('nocturne', 'Nocturne', '#d7bd84',
    ['#f1f2f1','#fafbf9','#e7ebee','#dde3e8','#c8d0d8','#203042','#596b7b','#606f7d','#294963','#1e374c','#dce5ec','#213f59','#a63146','#805914','#416783','#ffffff','#2c6c58'],
    ['#0c1220','#141f31','#101a2a','#22324a','#344762','#eaeef5','#b0bfd2','#96a8c0','#d7bd84','#efdab0','#393224','#f0d9a7','#ffadbb','#e9c281','#edce95','#221c13','#98d3bb'],uiNames),
  entry('garnet', 'Garnet', '#a22338',
    ['#f5eef0','#fffafb','#f0e3e7','#ecd7de','#d5b8c2','#3b1724','#765463','#805b6b','#8f203a','#701629','#f0dce3','#781a32','#a02438','#825719','#9d3b53','#ffffff','#356b55'],
    ['#050405','#160c11','#10070b','#2d1520','#512633','#f7e9ee','#d0aebd','#b893a4','#efa6b6','#ffd0db','#411522','#ffd0db','#ffb2c3','#e6c182','#f1b8c7','#370d1b','#b3d6c1'],uiNames),
  // Approved Glassy study variants. Semantic tokens stay opaque; glassy.css
  // owns scoped translucent paint and the application's static backdrop.
  entry('smoked-glass', 'Smoked Glass', '#92b9ad',
    ['#d9d9d6','#f9faf9','#eef1ef','#e0e5e3','#9ba8aa','#1b252b','#3b4d56','#52616a','#245c5e','#19494c','#d8e8e3','#174d4e','#9b3040','#80540c','#266b71','#ffffff','#16633d'],
    ['#22282e','#242a31','#262c32','#3b444b','#687780','#f7f8f9','#c4cdd2','#aebbc2','#c7ecdf','#e4fff3','#3e544e','#d9fff0','#ffb1ba','#ffd392','#bdf8eb','#172d31','#8be5b2'],uiNames),
  entry('harbor-haze', 'Harbor Haze', '#58c5cd',
    ['#c3e3e8','#f2ffff','#e7f9fd','#d1e9ed','#82aebc','#123743','#395969','#496775','#126b76','#0d515d','#c8e7e9','#095965','#a02f43','#80540c','#126d7d','#ffffff','#16633d'],
    ['#102635','#092639','#0d3045','#20445a','#557f94','#f3fcff','#bed7df','#9fbdc8','#8fe8e4','#b9fff6','#174d54','#bffff4','#ffadbb','#ffd392','#affff6','#172d31','#8be5b2'],uiNames),
  entry('amber-room', 'Amber Room', '#d5a169',
    ['#e5d7c3','#fff7e7','#fff5e1','#ebddc8','#b4a08a','#3a2a1e','#604939','#755b47','#855122','#633916','#eddcc3','#704014','#a13137','#80540c','#9a5c27','#ffffff','#16633d'],
    ['#342a24','#36271e','#412c1e','#574333','#947b65','#fff9f1','#e4d5c5','#c8b6a3','#ffd095','#ffe1ad','#614831','#ffe4bb','#ffb1b3','#ffd392','#ffdcaa','#44260f','#8be5b2'],uiNames),
  entry('opal-daylight', 'Opal Daylight', '#b1c6e5',
    ['#dfeaf1','#fdffff','#f7fcff','#dee8f2','#98b3c7','#1b3142','#3f586a','#526d7e','#37678d','#255475','#d9e8f3','#285b83','#9d324d','#80540c','#3e7bac','#ffffff','#16633d'],
    ['#1c293b','#182c43','#1d324a','#314860','#7189a2','#f4f9ff','#c7d5e5','#9ab1c6','#a5d8ff','#d2edff','#304f6c','#d7f2ff','#ffb1c6','#ffd392','#afdfff','#172d31','#8be5b2'],uiNames),
]);

// Original variable maps informed by familiar editor palettes. No upstream CSS
// rules are copied. Light adaptations and contrast adjustments are documented.
export const CODE_THEMES = Object.freeze([
  Object.freeze({ id: 'default', name: 'Default', swatch: '#4078f2', tokens: Object.freeze({ light: {}, dark: {} }) }),
  entry('vscode','VS Code','#569cd6',
    ['#ffffff','#000000','#f3f3f3','#444444','#d4d4d4','#008000','#0000ff','#a31515','#098658','#795e26','#267f99','#d00000','#001080','#707070','#393a34','#800000','#207d36','#e6ffed','#b31d28','#ffeef0'],
    ['#1e1e1e','#d4d4d4','#252526','#cccccc','#454545','#6a9955','#569cd6','#ce9178','#b5cea8','#dcdcaa','#4ec9b0','#9cdcfe','#9cdcfe','#c586c0','#d4d4d4','#d7ba7d','#b5cea8','#203622','#f0a0a0','#4d2323'],codeNames),
  entry('github','GitHub','#8250df',
    ['#ffffff','#24292f','#f6f8fa','#57606a','#d0d7de','#57606a','#cf222e','#0a3069','#0550ae','#8250df','#953800','#0550ae','#953800','#0550ae','#24292f','#116329','#116329','#dafbe1','#82071e','#ffebe9'],
    ['#0d1117','#c9d1d9','#161b22','#b1bac4','#30363d','#8b949e','#ff7b72','#a5d6ff','#79c0ff','#d2a8ff','#ffa657','#79c0ff','#ffa657','#79c0ff','#c9d1d9','#7ee787','#aff5b4','#033a16','#ffdcd7','#67060c'],codeNames),
  entry('monokai','Monokai','#ff5c8d',
    ['#fbfaf1','#37352d','#efeddf','#625e50','#d8d4c1','#706d5c','#a9004a','#526c16','#7045a0','#526c16','#197183','#773c91','#9b480e','#5d557d','#454237','#a9004a','#316729','#e7eed9','#a3293a','#f7e3e5'],
    ['#272822','#f8f8f2','#34352d','#d3d0bc','#555747','#a7a48e','#ff5c8d','#e6db74','#ae81ff','#a6e22e','#66d9ef','#c49ae4','#fd971f','#e6db74','#f8f8f2','#a6e22e','#c5eb89','#334224','#ffa8b6','#522b34'],codeNames),
  entry('nord','Nord','#81a1c1',
    ['#eceff4','#2e3440','#e2e7ef','#4c566a','#bfc9d8','#59677f','#4c6290','#416f37','#85518c','#2e6c84','#386f77','#7d4c23','#8b4350','#57627f','#3b4252','#486b36','#416f37','#dce9d8','#8b4350','#f0dfe2'],
    ['#2e3440','#eceff4','#3b4252','#d8dee9','#56627b','#9aa8bf','#81a1c1','#a3be8c','#c69abd','#88c0d0','#8fbcbb','#dda482','#d8989f','#c69abd','#eceff4','#ebcb8b','#c3dba9','#374538','#f0afb5','#50353f'],codeNames),
  entry('dracula','Dracula','#bd93f9',
    ['#faf7ff','#332d43','#eee8f7','#665978','#d8cbe7','#6f6786','#963b84','#456822','#6f45a7','#256d44','#1d6c82','#7c510c','#843a5d','#664e98','#463c61','#843a5d','#256d44','#e2f3e8','#a13164','#f8e3ef'],
    ['#282a36','#f8f8f2','#343746','#d0cce7','#575974','#9c9ec5','#ff79c6','#f1fa8c','#bd93f9','#50fa7b','#8be9fd','#f1fa8c','#ffb86c','#bd93f9','#ff79c6','#50fa7b','#9bffc0','#234d36','#ffb4d4','#59293f'],codeNames),
  entry('solarized','Solarized','#268bd2',
    ['#fdf6e3','#586e75','#eee8d5','#52686f','#cfc8b4','#5c727a','#637200','#187d76','#996600','#2075a0','#526bb0','#9d480c','#a73731','#7a548b','#586e75','#6c7100','#456c18','#e5edc8','#a73731','#f6e2d7'],
    ['#002b36','#a1b1b1','#073642','#b1bfbf','#315764','#839496','#a6ad35','#2fb9ab','#d9a431','#57aade','#9095e5','#ee9250','#f77a6f','#cd86aa','#a1b1b1','#a6ad35','#c3cf68','#28422c','#ffaaa2','#573b3b'],codeNames),
  entry('codex','Codex','#85c8b6',
    ['#f5f4ef','#252922','#e9ebe2','#56614f','#cbd2c2','#647161','#2c7165','#826027','#835f9d','#326d91','#61712c','#9b4d36','#445c73','#745a6f','#484f43','#657331','#386b3e','#e0eddd','#a23e3a','#f1e2dd'],
    ['#151917','#e3e8dd','#202821','#b7c4af','#39473b','#98a591','#85c8b6','#d9c28a','#b8a3d5','#94bfd8','#b5c684','#e7a68b','#a7bbce','#c2a6bc','#c3cfbd','#adc48b','#b8d5a2','#283c28','#edb1a5','#452d28'],codeNames),
  entry('xcode', 'Xcode Classic', '#fc5fa3',
    ['#ffffff','#262626','#f1f2f5','#5f6570','#d3d7de','#5d6c79','#aa0d91','#c41a16','#1c00cf','#326d74','#5c2699','#765d20','#3f6e74','#643820','#454555','#aa0d91','#226535','#e5f1e8','#aa2638','#f9e5e6'],
    ['#1f1f24','#dfdfe0','#29292f','#a6a6b3','#414149','#9193a4','#fc5fa3','#fc6a5d','#d0bf69','#67b7a4','#dabafa','#a9a1f0','#78c2b3','#fd8f3f','#d4d4e0','#fc5fa3','#a3d491','#27372c','#ffb0b0','#432a2e'],codeNames),
  entry('ayu', 'Ayu', '#ff8f40',
    ['#fcfcfc','#5c6166','#f3f4f5','#60696f','#d7dce1','#657484','#995000','#547716','#8b4ba8','#8a6307','#196d81','#9c4d34','#385d85','#92551c','#785213','#7b3d70','#47720d','#e8f1dc','#a93832','#f9e4df'],
    ['#0d1017','#bfbdb6','#151a23','#aab3c1','#303947','#8494a6','#ff8f40','#aad94c','#d2a6ff','#ffb454','#59c2ff','#f29e74','#c7dcf2','#ffb454','#f29668','#d2a6ff','#c0db75','#263520','#ffa08c','#432921'],codeNames),
]);

export const UI_PALETTE_IDS = Object.freeze(UI_PALETTES.map(theme => theme.id));
export const CODE_THEME_IDS = Object.freeze(CODE_THEMES.map(theme => theme.id));
export const APPEARANCE_DEFAULTS = Object.freeze({ uiPalette: 'default', codeTheme: 'default' });
export const SOURCE_SWITCH_WIDTHS = Object.freeze(['server-wider', 'equal', 'local-wider']);
