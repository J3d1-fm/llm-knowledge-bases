export const knowledgeSeed = {
  meta: {
    title: "LLM Knowledge Bases Research Wiki",
    summary: "A compiled product-research vault for turning raw research sources into a maintained markdown knowledge base operated by an LLM agent.",
    updatedAt: "2026-06-15",
    wordCount: 428000,
    articleCount: 8,
    sourceCount: 6,
    outputCount: 4,
    integrityScore: 86
  },
  articles: [
    {
      id: "filesystem-source-of-truth",
      title: "Filesystem as Source of Truth",
      type: "Architecture",
      confidence: "High",
      summary: "The durable system is a local directory of markdown, images, and generated outputs that can be inspected, versioned, copied, and opened in Obsidian.",
      body: [
        "The core product promise is that knowledge work should add up. Raw sources enter the vault once, compiled wiki pages evolve over time, and every meaningful answer can be filed back into the knowledge base.",
        "This structure makes the user less dependent on a single agent session. The LLM can rebuild context from indexes, backlinks, summaries, and source manifests without needing a heavy RAG stack at small scale.",
        "The filesystem model also keeps exit costs low: the user can keep Obsidian, git, image folders, Marp decks, and local scripts even if the agent layer changes."
      ],
      tags: ["architecture", "obsidian", "portability"],
      links: ["wiki-compiler", "query-to-artifact-loop", "health-checks"],
      sources: ["source-user-brief", "source-obsidian-workflow"]
    },
    {
      id: "wiki-compiler",
      title: "LLM Wiki Compiler",
      type: "Core Mechanic",
      confidence: "High",
      summary: "The agent acts less like a chatbot and more like a compiler that turns raw material into a navigable wiki: summaries, concepts, backlinks, category pages, and indexes.",
      body: [
        "The compiler pass should be incremental. New sources are summarized, linked to existing concepts, and queued for deeper article creation only when they add new information.",
        "Compilation should leave traces. Each generated page needs source coverage, revision notes, confidence markers, backlinks, and open questions.",
        "A good compiler does not flatten all nuance into a single summary. It preserves disagreement, marks missing evidence, and creates candidate pages when a concept begins appearing across sources."
      ],
      tags: ["compiler", "markdown", "agent-workflow"],
      links: ["filesystem-source-of-truth", "source-coverage", "health-checks"],
      sources: ["source-user-brief", "source-llm-agent-patterns"]
    },
    {
      id: "query-to-artifact-loop",
      title: "Query to Artifact Loop",
      type: "Workflow",
      confidence: "High",
      summary: "The strongest behavior is turning useful answers into durable markdown, slides, charts, or maps that become new wiki material.",
      body: [
        "A query starts with a question, but the output should be a file when the answer is reusable. Markdown reports, Marp decks, comparison tables, and generated charts all become part of the vault.",
        "The workflow creates compounding returns: every exploration becomes searchable, linkable, and available to the next agent run.",
        "This is the product wedge against ordinary chat. The workbench should make filing an output back into the wiki feel like the normal completion state."
      ],
      tags: ["outputs", "reports", "slides"],
      links: ["output-studio", "filesystem-source-of-truth", "agent-cli"],
      sources: ["source-user-brief", "source-marp-notes"]
    },
    {
      id: "health-checks",
      title: "Knowledge Health Checks",
      type: "Integrity",
      confidence: "Medium",
      summary: "LLM health checks can find contradictions, weak citations, missing data, stale summaries, orphan concepts, and article candidates.",
      body: [
        "The health layer is what turns the wiki from a pile of generated prose into a maintained research asset.",
        "The most important checks are not cosmetic. They should flag contradictions, source gaps, old claims, and generated pages that no longer reflect the raw material.",
        "Health checks should produce actionable queues: fix now, research later, merge duplicate concept, add source, or promote output into wiki."
      ],
      tags: ["quality", "linting", "integrity"],
      links: ["source-coverage", "wiki-compiler", "interesting-question-engine"],
      sources: ["source-user-brief", "source-health-check-notes"]
    },
    {
      id: "source-coverage",
      title: "Source Coverage Model",
      type: "Data Model",
      confidence: "Medium",
      summary: "Every wiki article should know which sources support it, which raw materials were ignored, and which claims still need confirmation.",
      body: [
        "Coverage is the bridge between raw ingest and trust. Without it, the wiki becomes polished but hard to audit.",
        "A simple coverage model can track source IDs, extracted claims, confidence, last reviewed date, and affected wiki pages.",
        "This can stay lightweight for a 100-article vault: markdown frontmatter plus generated index pages is enough before a database is justified."
      ],
      tags: ["data-model", "citations", "trust"],
      links: ["health-checks", "wiki-compiler", "filesystem-source-of-truth"],
      sources: ["source-health-check-notes", "source-user-brief"]
    },
    {
      id: "agent-cli",
      title: "Agent CLI Tooling",
      type: "Tools",
      confidence: "Medium",
      summary: "Small command-line tools can give the LLM better handles: search the vault, inspect backlinks, render charts, export decks, and run health checks.",
      body: [
        "The CLI layer should expose deterministic operations that are awkward to perform through freeform prompting alone.",
        "The user can use the same tools directly in a web UI, but the primary customer may be the LLM agent itself.",
        "The first tools should be boring and reliable: search, list stale pages, validate links, summarize source coverage, and render output files."
      ],
      tags: ["cli", "search", "automation"],
      links: ["query-to-artifact-loop", "health-checks", "output-studio"],
      sources: ["source-user-brief", "source-search-prototype"]
    },
    {
      id: "output-studio",
      title: "Output Studio",
      type: "Product Surface",
      confidence: "Medium",
      summary: "The workbench should make outputs first-class: markdown research briefs, Marp slides, charts, graph maps, tables, and Obsidian-viewable artifacts.",
      body: [
        "Outputs are not final chat messages. They are reusable knowledge products that can be versioned and re-opened.",
        "The product should support preview, file path, source coverage, and a decision: file back into wiki, keep as output, or discard.",
        "A strong output studio makes the system feel less like a search box and more like a research operating environment."
      ],
      tags: ["marp", "visualization", "reports"],
      links: ["query-to-artifact-loop", "agent-cli", "filesystem-source-of-truth"],
      sources: ["source-marp-notes", "source-user-brief"]
    },
    {
      id: "interesting-question-engine",
      title: "Interesting Question Engine",
      type: "Research Direction",
      confidence: "Low",
      summary: "Once the vault has enough structure, the agent can suggest useful next questions, article candidates, comparisons, and missing-source investigations.",
      body: [
        "The strongest next-step suggestions come from gaps in the wiki graph: repeated concepts without an article, claims with weak source support, and clusters that never link to each other.",
        "The system should separate curiosity from maintenance. Some suggestions improve integrity; others open new research tracks.",
        "This engine can start as a health-check output before becoming a recommendation surface."
      ],
      tags: ["research", "recommendations", "graph"],
      links: ["health-checks", "source-coverage", "wiki-compiler"],
      sources: ["source-health-check-notes", "source-user-brief"]
    }
  ],
  sources: [
    {
      id: "source-user-brief",
      title: "Original LLM Knowledge Bases Brief",
      kind: "User essay",
      status: "Indexed",
      summary: "Describes the raw-to-wiki workflow, Obsidian frontend, Q&A loop, output filing, health checks, and future finetuning direction.",
      usedBy: ["filesystem-source-of-truth", "wiki-compiler", "query-to-artifact-loop", "health-checks"]
    },
    {
      id: "source-obsidian-workflow",
      title: "Obsidian Vault Workflow Notes",
      kind: "Workflow",
      status: "Compiled",
      summary: "Captures Obsidian as the viewing and navigation layer while the LLM owns wiki generation and maintenance.",
      usedBy: ["filesystem-source-of-truth", "wiki-compiler"]
    },
    {
      id: "source-llm-agent-patterns",
      title: "Agent Compiler Pattern Notes",
      kind: "Research notes",
      status: "Needs expansion",
      summary: "Maps how an LLM agent can maintain indexes, article summaries, backlinks, and source manifests without a heavy retrieval stack.",
      usedBy: ["wiki-compiler", "agent-cli"]
    },
    {
      id: "source-health-check-notes",
      title: "Knowledge Integrity Health Check Notes",
      kind: "Checklist",
      status: "Compiled",
      summary: "Lists contradiction scans, missing citation checks, stale source review, and article candidate generation.",
      usedBy: ["health-checks", "source-coverage", "interesting-question-engine"]
    },
    {
      id: "source-search-prototype",
      title: "Naive Vault Search Prototype",
      kind: "Tool prototype",
      status: "Indexed",
      summary: "Small search engine idea that can serve both a human web UI and an LLM CLI tool.",
      usedBy: ["agent-cli", "query-to-artifact-loop"]
    },
    {
      id: "source-marp-notes",
      title: "Markdown and Marp Output Notes",
      kind: "Output format",
      status: "Indexed",
      summary: "Notes on rendering research answers as markdown files, Marp slide decks, and chart images viewable in Obsidian.",
      usedBy: ["query-to-artifact-loop", "output-studio"]
    }
  ],
  checks: [
    {
      id: "check-firestore-auth-boundary",
      title: "Firestore auth boundary",
      severity: "High",
      status: "Passing",
      scope: "Security rules",
      finding: "Workspace data is stored in Firestore and rules allow reads only for the configured owner email.",
      nextAction: "Keep private source imports out of the public repository and write them through a trusted admin path."
    },
    {
      id: "check-source-coverage",
      title: "Article source coverage",
      severity: "Medium",
      status: "Passing",
      scope: "Wiki articles",
      finding: "All demo articles point back to at least one source object.",
      nextAction: "Add per-claim citation granularity when real source documents are imported."
    },
    {
      id: "check-orphan-concepts",
      title: "Orphan concept scan",
      severity: "Low",
      status: "Passing",
      scope: "Knowledge graph",
      finding: "The demo article set is cross-linked enough for a first navigation surface.",
      nextAction: "Create graph density thresholds once the vault reaches 50+ compiled pages."
    },
    {
      id: "check-google-auth-provider",
      title: "Google Auth provider",
      severity: "High",
      status: "Needs verification",
      scope: "Authentication",
      finding: "The frontend uses Firebase Google sign-in. Provider enablement must be verified in the Firebase project before user testing.",
      nextAction: "Sign in on the hosted URL with j3d1fm@gmail.com and confirm Firestore reads succeed."
    }
  ],
  outputs: [
    {
      id: "output-product-brief",
      title: "Product Brief",
      type: "Markdown report",
      status: "Filed",
      path: "outputs/product-brief.md",
      summary: "Explains the product wedge: filesystem-first knowledge base, LLM compiler, Obsidian frontend, durable outputs."
    },
    {
      id: "output-mvp-spec",
      title: "MVP Spec",
      type: "Markdown spec",
      status: "Draft",
      path: "outputs/mvp-spec.md",
      summary: "Defines vault structure, agent commands, auth boundary, and first health checks."
    },
    {
      id: "output-marp-deck",
      title: "Research OS Pitch Deck",
      type: "Marp slides",
      status: "Candidate",
      path: "outputs/research-os-deck.md",
      summary: "Slide narrative for the product concept and early use cases."
    },
    {
      id: "output-graph-map",
      title: "Concept Graph Map",
      type: "Visualization",
      status: "Candidate",
      path: "outputs/concept-graph.png",
      summary: "Visual map of articles, sources, and candidate knowledge gaps."
    }
  ]
};
