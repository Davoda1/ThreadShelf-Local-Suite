/* Fictional, offline fixtures for the clearly labelled demo workspace. */
(function () {
  'use strict';
  const message = (role, content, day, hour) => ({role,content,model:role==='assistant'?'Demo assistant':undefined,createdAt:`2026-10-${day}T${hour||'10'}:00:00Z`});
  // Three conversational guides and two visual notebooks. All are authored demo content.
  const additions = [
  {
    "id": "guide-start-here",
    "title": "Start here · Your ThreadShelf guide",
    "collection": "Getting started",
    "provider": "Claude",
    "date": "2026-10-16T13:03:00Z",
    "messages": [
      {
        "role": "user",
        "content": "I have just opened ThreadShelf Local Alternative. Where should I start?",
        "createdAt": "2026-10-16T10:00:00Z"
      },
      {
        "role": "assistant",
        "content": "Start with a conversation you would like to return to. This workspace lets you **find it, read its context, and keep your place**.\n\nHere is your menu. Each link opens the destination inside this demo.\n\n| I want to… | Open… |\n| --- | --- |\n| Learn the search and reading controls | [Find the thread](https://guide.threadshelf.invalid/chat/guide-search-and-read) |\n| Connect my archive or find the project source | [Server, source, and resources](https://guide.threadshelf.invalid/chat/guide-server-and-resources) |\n| See cards, charts, images, and citations | [The paper observatory](https://guide.threadshelf.invalid/chat/showcase-observatory) |\n| Explore diagrams, equations, and code | [The diagram workshop](https://guide.threadshelf.invalid/chat/showcase-workshop) |\n| Browse all thirteen conversations | [Library](https://guide.threadshelf.invalid/action/library) |\n\nTry the two showcases first if you want a quick visual tour. The other eight sample conversations are still here, alongside these three guides.",
        "createdAt": "2026-10-16T10:00:00Z",
        "model": "Claude"
      },
      {
        "role": "user",
        "content": "Can I make the page more comfortable before I read?",
        "createdAt": "2026-10-16T10:00:00Z"
      },
      {
        "role": "assistant",
        "content": "Yes. Open [Reading & appearance](https://guide.threadshelf.invalid/action/settings) to choose a light, dark, or system theme, adjust the text size, and set the reading width.\n\nFor a quieter view, [enter focus mode](https://guide.threadshelf.invalid/action/focus). The **Exit focus** control brings the library back. You can also use **Ctrl+Shift+F** to toggle focus or **Esc** to leave it.\n\nIf you are following a long conversation, [open its outline](https://guide.threadshelf.invalid/action/outline) and choose a prompt. The small reading summary belongs to the current conversation.",
        "createdAt": "2026-10-16T10:00:00Z",
        "model": "Claude"
      },
      {
        "role": "user",
        "content": "What will the app remember for me?",
        "createdAt": "2026-10-16T10:00:00Z"
      },
      {
        "role": "assistant",
        "content": "Use the pin icon above a conversation to keep it in [Pins](https://guide.threadshelf.invalid/action/pins). [Recent](https://guide.threadshelf.invalid/action/recent) collects conversations you have opened. Your reading preferences and reading positions are stored locally.\n\nDemo items stay separate from items on a connected server. Pins point back to their source conversation; they do not make an offline copy of its contents.\n\nWhen you are ready, [connect your ThreadShelf server](https://guide.threadshelf.invalid/action/connect). The desktop application opens your real archive. The standalone HTML file remains an offline demonstration.",
        "createdAt": "2026-10-16T10:00:00Z",
        "model": "Claude"
      }
    ],
    "guideOrder": 0
  },
  {
    "id": "guide-search-and-read",
    "title": "Find the thread · Search, read, return",
    "collection": "Getting started",
    "provider": "Claude",
    "date": "2026-10-16T13:02:00Z",
    "messages": [
      {
        "role": "user",
        "content": "I remember a phrase from a conversation. How do I find the right passage?",
        "createdAt": "2026-10-16T10:00:00Z"
      },
      {
        "role": "assistant",
        "content": "Press **Ctrl+K**, type the phrase, and press **Enter**. **Text search** is the predictable choice when you remember the words.\n\nTry [searching for “twenty-minute”](https://guide.threadshelf.invalid/action/search?q=twenty-minute). The matching sample contains a small weekly reading ritual. Open the result to read the surrounding conversation.\n\nThe **Filters** control lets you choose a collection and, during a content search, restrict matches to your prompts or the responses. Clear the query to browse titles again. Browsing offers date, title, and length sorts; content searches keep the server’s result order.",
        "createdAt": "2026-10-16T10:00:00Z",
        "model": "Claude"
      },
      {
        "role": "user",
        "content": "What changes when I select Semantic instead?",
        "createdAt": "2026-10-16T10:00:00Z"
      },
      {
        "role": "assistant",
        "content": "**Semantic search** asks your connected server to find related meaning. It is useful when you remember an idea but not its wording, and it depends on the model available on that server.\n\nIn this offline demo, Semantic uses a small keyword approximation. A notice makes that limitation visible.\n\nRead the result count together with any notice: a server may provide only a bounded set of matching passages. The reader reports that limit instead of presenting it as the complete archive.",
        "createdAt": "2026-10-16T10:00:00Z",
        "model": "Claude"
      },
      {
        "role": "user",
        "content": "How do I stay oriented after I open a long thread?",
        "createdAt": "2026-10-16T10:00:00Z"
      },
      {
        "role": "assistant",
        "content": "Use **Ctrl+F** to find text within the open conversation. **Enter** moves to the next match; **Shift+Enter** moves back. This is separate from searching the server.\n\nThe [outline](https://guide.threadshelf.invalid/action/outline) follows the prompts. Click one to jump to that part of the conversation. The progress indicator shows your place, and the app remembers where you stopped.\n\n| Shortcut | Action |\n| --- | --- |\n| Ctrl+K | Search the library |\n| Ctrl+F | Find in this conversation |\n| Ctrl+Shift+F | Toggle focus mode |\n| Ctrl+\\ | Show or hide the library |\n| Esc | Close the active reading panel or leave focus |\n\nFor a hands-on example, open [The diagram workshop](https://guide.threadshelf.invalid/chat/showcase-workshop) and search within it for **reading_minutes**.",
        "createdAt": "2026-10-16T10:00:00Z",
        "model": "Claude"
      },
      {
        "role": "user",
        "content": "Can I keep a useful search and take a copy of an answer?",
        "createdAt": "2026-10-16T10:00:00Z"
      },
      {
        "role": "assistant",
        "content": "After running a search, use the **+** button beside the search modes to save it. The bookmark control above the library opens your saved searches. Each search remembers its server, collection, query, and selected search options.\n\nUse **Copy conversation** for plain text or **Export conversation** for a Markdown file. Code blocks also have their own copy button. A repaired diagram keeps the original saved source available; **Copy repaired** is a separate action when a repair is shown.\n\n[Return to the start menu](https://guide.threadshelf.invalid/chat/guide-start-here) · [Open Reading & appearance](https://guide.threadshelf.invalid/action/settings)",
        "createdAt": "2026-10-16T10:00:00Z",
        "model": "Claude"
      }
    ],
    "guideOrder": 1
  },
  {
    "id": "guide-server-and-resources",
    "title": "Your archive · Server, source, and resources",
    "collection": "Getting started",
    "provider": "Claude",
    "date": "2026-10-16T13:01:00Z",
    "messages": [
      {
        "role": "user",
        "content": "How do I connect the desktop app to my existing ThreadShelf archive?",
        "createdAt": "2026-10-16T10:00:00Z"
      },
      {
        "role": "assistant",
        "content": "Start your ThreadShelf server, then [open the connection panel](https://guide.threadshelf.invalid/action/connect) and enter its address, including the protocol and port.\n\nFor a server on the same computer, an address might be `http://localhost:3000`. For a different computer, use that server’s reachable address. Keep any path prefix your installation needs.\n\nAfter connection, choose a collection or leave **All collections** selected. ThreadShelf Local Alternative reads the archive through the server API. It does not import conversations into, or change settings in, your other ThreadShelf desktop projects.",
        "createdAt": "2026-10-16T10:00:00Z",
        "model": "Claude"
      },
      {
        "role": "user",
        "content": "Where is the actual GitHub project, and which links should I keep?",
        "createdAt": "2026-10-16T10:00:00Z"
      },
      {
        "role": "assistant",
        "content": "The upstream server is **ChrystianSchutz/ThreadShelf**. These links open in your browser:\n\n- [ThreadShelf repository and README](https://github.com/ChrystianSchutz/ThreadShelf#readme) — source and project instructions.\n- [ThreadShelf releases](https://github.com/ChrystianSchutz/ThreadShelf/releases) — the repository’s release page.\n- [ThreadShelf issues](https://github.com/ChrystianSchutz/ThreadShelf/issues) — existing reports and discussions of problems.\n\n**ThreadShelf Local Alternative** belongs to the independent [ThreadShelf Local Suite](https://github.com/Davoda1/ThreadShelf-Local-Suite). The suite repository provides desktop downloads, source, the illustrated manual, and the server search patch. The upstream links above refer to the separate ThreadShelf server project.",
        "createdAt": "2026-10-16T10:00:00Z",
        "model": "Claude"
      },
      {
        "role": "user",
        "content": "What should I check if the archive or search results do not appear?",
        "createdAt": "2026-10-16T10:00:00Z"
      },
      {
        "role": "assistant",
        "content": "First, open the same server address in your browser. Confirm that the server is running, the port is correct, and the computer is reachable. Then reconnect in the app.\n\nIf connection works but search is empty:\n\n1. Clear the query and confirm that conversations appear in the library.\n2. Check the selected collection and role filter.\n3. Try a distinctive word that appears in a conversation.\n4. Read the result notice. Search coverage and pagination depend on the server and its installed extensions.\n\nThe app can use the supported Reader search extension when the server provides it. It does not install or alter that extension. If you use the custom search fixes, keep them with your server installation.\n\n[Connect a server](https://guide.threadshelf.invalid/action/connect) · [Search and reading guide](https://guide.threadshelf.invalid/chat/guide-search-and-read) · [Start menu](https://guide.threadshelf.invalid/chat/guide-start-here)",
        "createdAt": "2026-10-16T10:00:00Z",
        "model": "Claude"
      }
    ],
    "guideOrder": 2
  },
  {
    "id": "showcase-observatory",
    "title": "The paper observatory · A visual research notebook",
    "collection": "Rendering showcase",
    "provider": "ChatGPT",
    "date": "2026-10-16T12:20:00Z",
    "messages": [
      {
        "role": "user",
        "content": "Imagine a small neighborhood observatory. Give me a visual notebook page with a place card and an observation, using invented details.",
        "createdAt": "2026-10-16T10:00:00Z"
      },
      {
        "role": "assistant",
        "content": "Let’s call it the **Paper Observatory**: a fictional reading room with a roof garden and a notebook by the window.\n\n<box border padding={3} gap={3}>\n<row align=\"start\" gap={3}>\n<AsyncImage query=\"A small fictional rooftop observatory with copper details\" aspectRatio=\"4:3\" maxWidth=\"180px\"/>\n<box flex=\"1\" gap={1}>\n**<Entity category=\"place\" value=\"Paper Observatory\" disambig=\"Fictional neighborhood notebook\"/>**\nA quiet place to record the light, compare notes, and notice what changed since the last visit.\n<text color=\"secondary\">Field note 04 · A clear evening after rain</text>\n</box>\n</row>\n<divider/>\n<text>The image above was described in the saved conversation, but no image file is included. Its compact placeholder keeps the description beside the text.</text>\n</box>\n\nFor the wider view, leave room for the whole roofline:\n\n<AsyncImage query=\"Fictional rooftop garden at dusk, with a broad horizon and the observatory at one side\" aspectRatio=\"16:9\" width=\"100%\"/>\n\nThe wider placeholder preserves that composition without inventing a photograph.",
        "createdAt": "2026-10-16T10:00:00Z",
        "model": "ChatGPT"
      },
      {
        "role": "user",
        "content": "Suppose we made 12, 18, 15, and 24 visits over four weeks. Can you show the pattern and the plan for next week?",
        "createdAt": "2026-10-16T10:00:00Z"
      },
      {
        "role": "assistant",
        "content": "Visits increased overall, with a small dip in week three. These are the invented counts you supplied.\n\n<Chart content={{\"chartType\":\"bar\",\"meta\":{\"title\":\"Four weeks at the Paper Observatory\",\"description\":\"Fictional visits recorded in a sample notebook\",\"footer\":\"Demo data · visits per week\"},\"xKey\":\"week\",\"series\":[{\"dataKey\":\"visits\",\"label\":\"Visits\",\"valueFormat\":\"raw\"}],\"yAxisMin\":0,\"yAxisMax\":30,\"data\":[{\"week\":\"Week 1\",\"visits\":12},{\"week\":\"Week 2\",\"visits\":18},{\"week\":\"Week 3\",\"visits\":15},{\"week\":\"Week 4\",\"visits\":24}]}}/>\n\nHover or focus the chart marks to inspect the recorded values. The chart is a different view of the same small table:\n\n| Week | Visits | Change |\n| --- | ---: | ---: |\n| 1 | 12 | — |\n| 2 | 18 | +6 |\n| 3 | 15 | −3 |\n| 4 | 24 | +9 |\n\nFor next week, three of the four planned observation sessions have a volunteer:\n\n<box gap={1}>\n<text color=\"success\">Observation rota · 75% covered</text>\n<box width=\"100%\" height=\"14px\" background=\"surface-tertiary\" radius=\"full\" clip><box width=\"75%\" height=\"14px\" background=\"success\" radius=\"full\"/></box>\n</box>\n\nThe open session is a useful next action, rather than a reason to add more charts.",
        "createdAt": "2026-10-16T10:00:00Z",
        "model": "ChatGPT"
      },
      {
        "role": "user",
        "content": "How would you summarize the numbers without making them seem more precise than they are?",
        "createdAt": "2026-10-16T10:00:00Z"
      },
      {
        "role": "assistant",
        "content": "There were **69 visits** across four weeks, for a mean of **17.25 visits per week**.\n\n$$\\bar{x}=\\frac{12+18+15+24}{4}=17.25$$\n\nThe calculation is exact for these four invented counts; it does not predict attendance next month.\n\n```python\nvisits = [12, 18, 15, 24]\ntotal = sum(visits)\nmean = total / len(visits)\nprint(f\"{total} visits; {mean:.2f} per week\")\n```\n\n> Keep the observation, the calculation, and the interpretation distinct. That makes a notebook easier to revisit.",
        "createdAt": "2026-10-16T10:00:00Z",
        "model": "ChatGPT"
      },
      {
        "role": "user",
        "content": "What happens to sources and image references when a notebook like this is saved?",
        "createdAt": "2026-10-16T10:00:00Z"
      },
      {
        "role": "assistant",
        "content": "A saved citation can keep its original destination when the export records an explicit source binding. Here is a bound reference to the ThreadShelf project: <Cite ref=\"turn1search0\"/>.\n\nIf a source binding was not included, the reader can preserve its reference without guessing a destination: <Cite ref=\"turn9search9\"/>. Hover the unresolved citation to see what was saved.\n\nA plain link remains useful too: [ThreadShelf source and README](https://github.com/ChrystianSchutz/ThreadShelf#readme).\n\n[Visit the diagram workshop](https://guide.threadshelf.invalid/chat/showcase-workshop) · [Back to the guide](https://guide.threadshelf.invalid/chat/guide-start-here)",
        "createdAt": "2026-10-16T10:00:00Z",
        "model": "ChatGPT",
        "source_message_id": "showcase-observatory-sources",
        "source_node_id": "showcase-observatory-sources-node"
      }
    ],
    "raw": {
      "mapping": {
        "showcase-observatory-sources-node": {
          "message": {
            "id": "showcase-observatory-sources",
            "metadata": {
              "content_references": [
                {
                  "type": "grouped_webpages",
                  "items": [
                    {
                      "url": "https://github.com/ChrystianSchutz/ThreadShelf",
                      "title": "ThreadShelf — source repository",
                      "refs": [
                        {
                          "turn_index": 1,
                          "ref_type": "search",
                          "ref_index": 0
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          }
        }
      }
    }
  },
  {
    "id": "showcase-workshop",
    "title": "The diagram workshop · From rough notes to clear plans",
    "collection": "Rendering showcase",
    "provider": "ChatGPT",
    "date": "2026-10-16T12:10:00Z",
    "messages": [
      {
        "role": "user",
        "content": "I found a rough flowchart in my notes. Can you show the idea while keeping the original text available?",
        "createdAt": "2026-10-16T10:00:00Z"
      },
      {
        "role": "assistant",
        "content": "The plan has one decision: share a note now, or keep developing it. This saved Mermaid block omitted its diagram header:\n\n```mermaid\nA[Capture an idea] --> B{Ready to share?}\nB -->|Yes| C[Write a short summary]\nB -->|Not yet| D[Keep a working note]\nC --> E[Return after a week]\nD --> E\n```\n\nWhen a safe display repair is available, the diagram appears with a **Repaired preview** badge. You can inspect the original and repaired source. Copying the saved conversation keeps its original wording.",
        "createdAt": "2026-10-16T10:00:00Z",
        "model": "ChatGPT"
      },
      {
        "role": "user",
        "content": "I have two more fragments: one uses parentheses in a label, and another uses an old bar-chart shorthand.",
        "createdAt": "2026-10-16T10:00:00Z"
      },
      {
        "role": "assistant",
        "content": "Both are small presentation repairs rather than changes to the plan.\n\n```mermaid\nflowchart TD\n    A[Review (quietly)] --> B{Anything unclear?}\n    B -->|Yes| C[Add one concrete example]\n    B -->|No| D[Share the note]\n    C --> D\n```\n\nThe second fragment summarizes an imaginary week in the workshop. Its values are counts of notes, not performance scores.\n\n```mermaid\nbar\ntitle A week in the workshop\nDrafts 12\nRevisions 7\nPublished 4\n```\n\nUse **Copy repaired** if you want the corrected diagram syntax. The normal code-copy action preserves the saved source.",
        "createdAt": "2026-10-16T10:00:00Z",
        "model": "ChatGPT"
      },
      {
        "role": "user",
        "content": "Could you also give me a clean diagram for the reading workflow and a little function for estimating reading time?",
        "createdAt": "2026-10-16T10:00:00Z"
      },
      {
        "role": "assistant",
        "content": "Here is a sequence with three participants. It shows why a pin can remain local while the conversation still comes from a server.\n\n```mermaid\nsequenceDiagram\n    participant You\n    participant Reader\n    participant Server\n    You->>Reader: Search for a remembered phrase\n    Reader->>Server: Request matching passages\n    Server-->>Reader: Return matches and source identities\n    Reader-->>You: Show titles and excerpts\n    You->>Reader: Pin a useful conversation\n    Note over Reader: Keep the reference locally\n```\n\nFor a rough reading estimate, use $t=\\lceil w/r\\rceil$, where $w$ is the number of words and $r$ is the assumed rate in words per minute.\n\n```python\nfrom math import ceil\n\ndef reading_minutes(words, rate=220):\n    if rate <= 0:\n        raise ValueError(\"The reading rate must be positive\")\n    return max(1, ceil(words / rate))\n\nprint(reading_minutes(1100))  # 5 minutes\n```\n\n| Words | Rate | Estimate |\n| ---: | ---: | ---: |\n| 440 | 220 words/min | 2 minutes |\n| 1,100 | 220 words/min | 5 minutes |\n| 2,200 | 220 words/min | 10 minutes |\n\nA reading estimate is a navigation aid. Difficult code or unfamiliar notation may take longer.",
        "createdAt": "2026-10-16T10:00:00Z",
        "model": "ChatGPT"
      },
      {
        "role": "user",
        "content": "Show me a second chart format, and point me to the source project when I am ready to connect my own notes.",
        "createdAt": "2026-10-16T10:00:00Z"
      },
      {
        "role": "assistant",
        "content": "This line chart uses a native structured chart record. It tracks fictional **drafted** and **revisited** notes over four days; the zero is part of the data.\n\n<Chart content={{\"schema\":\"threadshelf-chart\",\"version\":1,\"type\":\"line\",\"title\":\"A small habit of returning\",\"categories\":[\"Monday\",\"Tuesday\",\"Wednesday\",\"Thursday\"],\"series\":[{\"label\":\"Drafted\",\"values\":[2,4,3,5]},{\"label\":\"Revisited\",\"values\":[0,2,3,4]}],\"yAxis\":{\"label\":\"Notes\",\"min\":0,\"max\":5}}}/>\n\nFor the source project, follow the recorded reference <Cite ref=\"turn2search0\"/> or open the [ThreadShelf repository](https://github.com/ChrystianSchutz/ThreadShelf).\n\n[Connect your server](https://guide.threadshelf.invalid/action/connect) · [Server and resources guide](https://guide.threadshelf.invalid/chat/guide-server-and-resources) · [Start menu](https://guide.threadshelf.invalid/chat/guide-start-here)",
        "createdAt": "2026-10-16T10:00:00Z",
        "model": "ChatGPT",
        "source_message_id": "showcase-workshop-sources",
        "source_node_id": "showcase-workshop-sources-node"
      }
    ],
    "raw": {
      "mapping": {
        "showcase-workshop-sources-node": {
          "message": {
            "id": "showcase-workshop-sources",
            "metadata": {
              "content_references": [
                {
                  "type": "grouped_webpages",
                  "items": [
                    {
                      "url": "https://github.com/ChrystianSchutz/ThreadShelf",
                      "title": "ThreadShelf — source repository",
                      "refs": [
                        {
                          "turn_index": 2,
                          "ref_type": "search",
                          "ref_index": 0
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          }
        }
      }
    }
  }
];
  const guideOrder = new Map(additions.filter(t => Number.isInteger(t.guideOrder)).map(t => [t.id,t.guideOrder]));
  const threads = [...additions,
    {id:'quiet-library',title:'Designing a quieter digital library',collection:'Ideas & research',provider:'ChatGPT',date:'2026-10-15T15:20:00Z',messages:[
      message('user','What would a digital library feel like if it were designed for returning to ideas, rather than collecting more of them?',15,'10'),
      message('assistant','A useful library makes **returning** feel easy. Its central promise is not “everything is here,” but “the thing you need is within reach.”\n\nThink of three movements:\n\n1. **Find a thread.** Search the words you remember, or follow an idea across a collection.\n2. **Recover the context.** See the question, the answer, and the small turns that changed your thinking.\n3. **Leave a marker.** Keep a handful of useful conversations close, without building another filing system.\n\n> A good archive is a place you can think in, not just a place you put things.\n\nThe visual design can support that promise: a narrow shelf for navigation, a generous reading surface, and a quiet outline that appears when you need it.',15,'10'),
      message('user','How would you decide what deserves space in the main interface?',15,'11'),
      message('assistant','Start with the moment of use. If someone is reading, the conversation should own the space. Everything else needs to earn its place.\n\n| Always within reach | Available when needed |\n| --- | --- |\n| Search and collection | Reading preferences |\n| Conversation title | Message outline |\n| Pin and return | Export and copy |\n| A clear way back | Connection details |\n\nThe most important distinction is between **orientation** and **operation**. A small breadcrumb tells you where you are; a visible exit tells you how to leave focus mode. Neither needs a permanent panel.\n\nKeep secondary controls small, label them clearly, and make the keyboard paths discoverable.',15,'11'),
      message('user','Give me a small principle I could use when making difficult design decisions.',15,'12'),
      message('assistant','### Preserve the trail\n\nA conversation is more than a document. It is a sequence of questions, revisions, uncertainties, and decisions. Preserve that sequence while making it comfortable to revisit.\n\nFor each proposed feature, ask:\n\n- Does it help someone find their way back?\n- Does it preserve enough context to understand the answer?\n- Does it reduce work the next time they visit?\n\nIf the answer is yes, it probably belongs.\n\nA practical rule for the reading surface is **one strong hierarchy, a few quiet affordances, and no competing destination**.',15,'12'),
      message('user','What should the first prototype include?',15,'13'),
      message('assistant','Build the smallest complete reading loop: **connect → find → read → return**.\n\nThe prototype should let someone connect an existing archive, choose a collection, search its content, read a full conversation, pin it, and resume their place later.\n\nThen test three concrete tasks:\n\n1. Find a conversation when you remember only a phrase.\n2. Jump to the third question in a long thread.\n3. Close the app and return to the same passage.\n\nIf those tasks feel calm and predictable, the foundation is doing its job.',15,'13')
    ]},
    {id:'local-search',title:'What makes local search feel fast?',collection:'Ideas & research',provider:'Claude',date:'2026-10-14T16:30:00Z',messages:[
      message('user','I am exploring a personal archive. What matters more for search: the response time or how the results are presented?',14),
      message('assistant','Both matter, but they solve different problems. Response time keeps the interaction moving; presentation helps you decide whether a result is useful.\n\nA search result should reveal **why it matched**: a short excerpt, the conversation title, and enough context to distinguish it from nearby results.\n\n### A useful progression\n\n- Keep the query visible.\n- Show matching text in context.\n- Explain incomplete or bounded results.\n- Open the conversation near the relevant turn.\n- Preserve the query when the reader returns.\n\nText search is predictable for remembered phrases. Semantic search can help with a remembered idea, but it needs an available server model and a clearly stated search mode.',14),
      message('user','What should happen when the server only returns a limited set of hits?',14,'11'),
      message('assistant','Say what you know. A label such as **“50 matches shown”** describes the result without implying that the full archive contains only 50 matches.\n\nKeep the server’s limitation visible in a short notice. Never manufacture another page when the server has not provided one.\n\nA result count is part of the search contract, not decoration.',14,'11')
    ]},
    {id:'reading-ritual',title:'A weekly ritual for unfinished ideas',collection:'Ideas & research',provider:'ChatGPT',date:'2026-10-12T09:00:00Z',messages:[
      message('user','I collect useful ideas but rarely return to them. Can you suggest a small weekly habit?',12),
      message('assistant','Reserve twenty minutes for a small review. Start with your recent conversations, then choose only one idea to carry forward.\n\n### The twenty-minute review\n\n1. **Five minutes:** scan the titles of this week’s conversations.\n2. **Ten minutes:** revisit one unfinished question and write what changed.\n3. **Five minutes:** decide a concrete next step.\n\nKeep the output tiny: a sentence, a decision, or one question for next week.\n\n> The point of revisiting an idea is to make it usable, not to prove you remembered it.',12),
      message('user','What if most of the ideas are not useful anymore?',12,'11'),
      message('assistant','That is useful information too. You do not need to turn every conversation into a commitment. A review can end with a clearer sense of what to stop carrying.\n\nPin only the conversations you expect to return to. Let recent history do the rest.',12,'11')
    ]},
    {id:'garden-notes',title:'Field notes from a small city garden',collection:'Ideas & research',provider:'Gemini',date:'2026-10-10T13:00:00Z',messages:[
      message('user','Help me structure a journal for observing a small city garden across the seasons.',10),
      message('assistant','Use the same handful of observations each time. Consistency makes small changes visible.\n\n| Observation | What to record |\n| --- | --- |\n| Light | Hours of direct sun and where the shadows fall |\n| Water | Recent rain, watering, and soil moisture |\n| Growth | New leaves, flowers, fruit, and dormant stems |\n| Visitors | Birds, insects, and signs of other animals |\n| One surprise | Something you did not expect to notice |\n\nDate each entry and keep one photo from the same viewpoint. After a season, the repeated frame becomes more informative than a collection of unrelated pictures.',10)
    ]},
    {id:'offline-first',title:'Designing an offline-first reading workflow',collection:'Build notebook',provider:'ChatGPT',date:'2026-10-13T16:40:00Z',messages:[
      message('user','How should I think about an offline-first reader when the conversations actually live on a local server?',13),
      message('assistant','Separate **local preferences** from **conversation availability**. The app can store pins, reading positions, and theme settings locally while retrieving conversation content from your ThreadShelf server.\n\nThat is a server-backed reader with local state. It should only promise offline conversation access if it actually caches the content.\n\n```text\nReader preferences  → local app data\nConversation source → your ThreadShelf server\nDemo conversations  → bundled fictional fixtures\n```\n\nTreat those as separate stores with explicit boundaries. A demo pin should never appear in a real server collection.',13),
      message('user','How would you identify the same conversation across sessions?',13,'12'),
      message('assistant','Use a composite identity that preserves its source. A title is not a reliable identifier.\n\n```javascript\nconst identity = {\n  serverUrl,\n  collection,\n  sourceFile,\n  conversationKey\n};\n```\n\nThe server, collection, source file, and conversation key together distinguish conversations with identical titles. Store that identity with a pin or reading position.',13,'12')
    ]},
    {id:'markdown-test',title:'A readable home for tables, code, and equations',collection:'Build notebook',provider:'Claude',date:'2026-10-11T17:00:00Z',messages:[
      message('user','Show me a small example conversation with structured content that a reader should render well.',11),
      message('assistant','### A tiny reading-time estimator\n\nA rough reading estimate divides the word count by a chosen rate. It is a navigation aid, not a measurement of comprehension.\n\n$$t = \\frac{w}{r}$$\n\nHere, $w$ is the number of words and $r$ is the assumed reading rate in words per minute.\n\n```python\nfrom math import ceil\n\ndef reading_minutes(words, rate=220):\n    return max(1, ceil(words / rate))\n```\n\n| Words | Approximate minutes at 220 wpm |\n| ---: | ---: |\n| 440 | 2 |\n| 1,100 | 5 |\n| 2,200 | 10 |\n\nA reader should preserve the table’s alignment, keep long code inside its own horizontal scroll area, and make copying the code straightforward.\n\n**Accessibility detail:** the surrounding conversation should still reflow when the window narrows.',11),
      message('user','And a simple diagram?',11,'12'),
      message('assistant','This small branching diagram distinguishes locating a conversation from deciding how to revisit it.\n\n```mermaid\nflowchart TD\n    A[Find a conversation] --> B{Read now?}\n    B -->|Yes| C[Open the full thread]\n    B -->|Later| D[Pin for another visit]\n    C --> E[Resume from reading position]\n    D --> E\n```',11,'12')
    ]},
    {id:'color-notes',title:'Color notes: warm paper, cool ink',collection:'Build notebook',provider:'ChatGPT',date:'2026-10-08T12:00:00Z',messages:[
      message('user','I want a reading interface with some warmth, without making it look aged or decorative.',8),
      message('assistant','Let warmth come from the background and coolness come from the structure. A pale paper surface, dark green-gray text, and restrained teal accents can give the interface a human tone without adding texture.\n\nReserve copper for small editorial details: a label, an index number, or a dividing line.\n\nThe same hierarchy can work in a dark theme. Lower the surface contrast, keep the text clear, and brighten the accent just enough to remain readable.',8)
    ]},
    {id:'small-tools',title:'Small tools that earn a permanent place',collection:'Ideas & research',provider:'Claude',date:'2026-10-06T09:00:00Z',messages:[
      message('user','Why do some simple tools keep being useful long after their novelty wears off?',6),
      message('assistant','They solve a recurring problem with a stable contract. You know what will happen, the tool remembers the right things, and returning does not require learning the interface again.\n\nFor a conversation reader, that means a search that explains its scope, a thread that preserves its structure, and a reading position that is still there tomorrow.\n\nSmall conveniences compound when they remove a repeated decision.',6)
    ]}
  ];
  function collectionName(value){return typeof value==='string'?value:value&&value.name||'';}
  function row(t,match){return {id:t.id,title:t.title,collection:t.collection,sourceFile:'fictional-demo.json',conversationKey:t.id,turnIndex:match?match.index:undefined,role:match?match.role:undefined,excerpt:match?match.content.slice(Math.max(0,match.at-50),match.at+170):t.messages[0].content,provider:t.provider,date:t.date,turnCount:t.messages.length};}
  function makeAdapter(){
    return {async connect(){return this.request('collections',{});},async request(method,args){args=args||{};if(method==='collections'){return {collections:[...new Set(threads.map(t=>t.collection))].map(name=>({name,count:threads.filter(t=>t.collection===name).length})),total:threads.length,demo:true};}if(method==='capabilities')return {demo:true,semantic:false};if(method==='thread'){const item=threads.find(t=>t.id===(args.conversationKey||args.id));if(!item)throw new Error('This demo conversation could not be found.');return JSON.parse(JSON.stringify(item));}if(method==='browse'||method==='search'){let selected=threads.filter(t=>!args.collection||args.collection==='all'||t.collection===collectionName(args.collection));let rows=selected.map(t=>row(t));const q=(args.q||'').toLocaleLowerCase().trim();if(q){rows=selected.flatMap(t=>{const words=args.mode==='semantic'?q.split(/\s+/).filter(x=>x.length>2):[q];const matches=t.messages.map((m,index)=>({...m,index,at:words.reduce((n,w)=>{const a=m.content.toLocaleLowerCase().indexOf(w);return a<0?n:n<0?a:Math.min(n,a);},-1)})).filter(m=>(!args.role||m.role===args.role)&&m.at>=0);if(matches.length)return [row(t,matches[0])];if(!args.role&&t.title.toLocaleLowerCase().includes(q))return [row(t)];return [];});}else if(args.role){rows=selected.filter(t=>t.messages.some(m=>m.role===args.role)).map(t=>row(t));}const sort=args.sort||'updated';const defaultGuideOrder=!q&&!args.role&&(!args.collection||args.collection==='all')&&sort==='updated';rows.sort((a,b)=>defaultGuideOrder&&((guideOrder.get(a.id)??99)!==(guideOrder.get(b.id)??99))?(guideOrder.get(a.id)??99)-(guideOrder.get(b.id)??99):sort==='title'?a.title.localeCompare(b.title):sort==='oldest'?a.date.localeCompare(b.date):sort==='length'?b.turnCount-a.turnCount:b.date.localeCompare(a.date));const offset=Number(args.offset)||0,limit=Number(args.limit)||30,total=rows.length;return {items:rows.slice(offset,offset+limit),total,totalKnown:true,offset,limit,hasMore:offset+limit<total,nextOffset:offset+limit,notice:args.mode==='semantic'&&q?'Demo semantic mode uses a keyword approximation. Real semantic search runs on your connected ThreadShelf server.':'',engine:'fictional-demo'};}throw new Error('Unknown demo operation.');}};
  }
  window.TSADemo={create:makeAdapter,reference(id){const thread=threads.find(t=>t.id===id);return thread?row(thread):null;},threads:threads.map(t=>({id:t.id,title:t.title,collection:t.collection,provider:t.provider,guideOrder:t.guideOrder}))};
})();
