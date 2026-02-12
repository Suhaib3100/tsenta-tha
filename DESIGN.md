# Design — Tsenta ATS Form Automator

Production-grade Playwright automation that fills job applications across ATS platforms with human-like behavior, anti-detection, and fault tolerance.

---

## Architecture Overview

```mermaid
graph TB
    subgraph Automator["🎯 Automator"]
        A[Load Profile] --> B[Create Stealth Context]
        B --> C[For Each Target URL]
        C --> D[Detect Platform]
        D --> E[Run Handler]
        E --> F[Capture Artifacts]
    end
    
    subgraph Core["⚙️ Core Layer"]
        G[log.ts<br/>Ora spinners]
        H[retry.ts<br/>Backoff + Circuit]
        I[stealth.ts<br/>Anti-detection]
        J[artifacts.ts<br/>Screenshots]
    end
    
    subgraph Engine["🤖 Engine Layer"]
        K[human.ts<br/>Bezier, typos, paste]
        L[fields.ts<br/>Form helpers]
        M[mappings.ts<br/>Value transforms]
    end
    
    subgraph Platforms["🏢 Platforms Layer"]
        N[base.ts<br/>Abstract Platform]
        O[acme.ts<br/>4-step wizard]
        P[globex.ts<br/>Accordion form]
    end
    
    Automator --> Core
    Automator --> Engine
    Automator --> Platforms
```

---

## Execution Flow

```mermaid
flowchart TD
    A([Start]) --> B[Load Candidate Profile]
    B --> C[Create Stealth Browser Context]
    C --> D{For Each Target URL}
    
    D --> E[Navigate to URL]
    E --> F[Detect Platform by URL Pattern]
    F --> G{Platform Found?}
    
    G -->|No| H[⚠️ Skip - Unknown ATS]
    G -->|Yes| I[Run Platform Handler]
    
    I --> J[Fill Form Fields]
    J --> K[Submit Application]
    K --> L[Extract Confirmation ID]
    
    L --> M{Success?}
    M -->|Yes| N[📸 Save Success Screenshot]
    M -->|No| O[🔴 Capture Failure Report]
    
    N --> P[Log Result]
    O --> P
    H --> P
    
    P --> D
    D -->|All Done| Q[Print Summary]
    Q --> R([End])
    
    style A fill:#10b981
    style R fill:#10b981
    style H fill:#f59e0b
    style O fill:#ef4444
    style N fill:#3b82f6
```

---

## Human Input Behavior

Varies input method based on content type — real humans don't behave consistently.

```mermaid
flowchart TD
    A[Input Text] --> B{URL or Email?}
    
    B -->|Yes| C[📋 PASTE<br/>Always paste links]
    B -->|No| D{Length < 50 chars?}
    
    D -->|Yes| E[⌨️ TYPE<br/>Character by character]
    D -->|No| F{Length ≤ 200 chars?}
    
    F -->|Yes| G{Random}
    G -->|70%| E
    G -->|30%| C
    
    F -->|No| H{Random Distribution}
    H -->|25%| I[⌨️ TYPE ALL<br/>Slow typer]
    H -->|30%| J[📋 PASTE ALL<br/>From document]
    H -->|25%| K[📋 PASTE + EDIT<br/>Fix a typo after]
    H -->|20%| L[⌨️ TYPE SOME → 📋 PASTE<br/>Give up halfway]
    
    K --> K1[Paste full text]
    K1 --> K2[Delete last char]
    K2 --> K3[Retype last char]
    
    L --> L1[Type 2-4 words]
    L1 --> L2[Pause... too slow]
    L2 --> L3[Select all + Paste]
    
    style C fill:#3b82f6
    style E fill:#10b981
    style I fill:#10b981
    style J fill:#3b82f6
    style K fill:#8b5cf6
    style L fill:#f59e0b
```

---

## Retry System

### Exponential Backoff

```mermaid
flowchart LR
    A[Attempt 1] -->|Fail| B[Wait 300ms]
    B --> C[Attempt 2]
    C -->|Fail| D[Wait 600ms]
    D --> E[Attempt 3]
    E -->|Fail| F[Wait 1.2s]
    F --> G[Attempt 4]
    G -->|Fail| H[❌ Give Up]
    
    A -->|Success| S[✅ Done]
    C -->|Success| S
    E -->|Success| S
    G -->|Success| S
    
    style S fill:#10b981
    style H fill:#ef4444
```

### Circuit Breaker States

```mermaid
stateDiagram-v2
    [*] --> Closed
    
    Closed --> Closed: ✅ Success
    Closed --> Closed: ❌ Failure (count < 3)
    Closed --> Open: ❌ Failures ≥ 3
    
    Open --> Open: 🚫 All calls rejected
    Open --> HalfOpen: ⏱️ Cooldown elapsed
    
    HalfOpen --> Closed: ✅ Test call succeeds
    HalfOpen --> Open: ❌ Test call fails
    
    note right of Closed: Normal operation
    note right of Open: Protect system
    note right of HalfOpen: Testing recovery
```

### Retry Profiles

```mermaid
gantt
    title Retry Timing Profiles
    dateFormat X
    axisFormat %L ms
    
    section Aggressive
    Attempt 1    :a1, 0, 100ms
    Wait 200ms   :a2, after a1, 200ms
    Attempt 2    :a3, after a2, 100ms
    Wait 400ms   :a4, after a3, 400ms
    Attempt 3    :a5, after a4, 100ms
    Wait 800ms   :a6, after a5, 800ms
    Attempt 4    :a7, after a6, 100ms
    Wait 1.6s    :a8, after a7, 1600ms
    Attempt 5    :a9, after a8, 100ms
    
    section Standard
    Attempt 1    :s1, 0, 100ms
    Wait 300ms   :s2, after s1, 300ms
    Attempt 2    :s3, after s2, 100ms
    Wait 600ms   :s4, after s3, 600ms
    Attempt 3    :s5, after s4, 100ms
    
    section Quick
    Attempt 1    :q1, 0, 100ms
    Wait 100ms   :q2, after q1, 100ms
    Attempt 2    :q3, after q2, 100ms
```

---

## Mouse Movement

```mermaid
flowchart LR
    subgraph Bot["🤖 Bot Movement"]
        B1((Start)) --> B2((End))
    end
    
    subgraph Human["👤 Human Movement"]
        H1((Start)) --> H2((Control 1))
        H2 --> H3((Control 2))
        H3 --> H4((End))
    end
```

```mermaid
xychart-beta
    title "Bezier Curve Mouse Path"
    x-axis [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    y-axis "Y Position" 0 --> 100
    line "Bot (straight)" [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 100]
    line "Human (bezier)" [10, 15, 25, 40, 55, 72, 85, 92, 97, 99, 100]
```

**Bot:** Straight line, constant speed — easily detected  
**Human:** S-curve, decelerates at end — natural motion

---

## Typeahead Interaction

```mermaid
sequenceDiagram
    participant User as 👤 Bot (as User)
    participant Input as 📝 Input Field
    participant Server as 🖥️ Server
    participant Dropdown as 📋 Dropdown
    
    User->>Input: Type "S"
    Note over Dropdown: Too few chars
    
    User->>Input: Type "Sa"
    Input->>Server: Search "Sa"
    Server-->>Dropdown: Results (async, shuffled)
    Note over Dropdown: San Diego<br/>San Jose<br/>San Francisco
    
    User->>User: Fuzzy match scores
    Note over User: "San Francisco" = 80<br/>(prefix match)
    
    User->>Dropdown: Click best match
    Dropdown->>Input: Fill "San Francisco, CA"
```

### Fuzzy Scoring

```mermaid
pie title Match Quality Distribution
    "Exact (100)" : 5
    "Prefix (80)" : 25
    "Words (60)" : 35
    "Contains (40)" : 25
    "Partial (0-20)" : 10
```

| Score | Match Type | Example |
|-------|------------|---------|
| **100** | Exact | `"react"` = `"react"` |
| **80** | Prefix | `"react"` starts `"reactjs"` |
| **60** | Words | `"native"` in `"react native"` |
| **40** | Contains | `"act"` within `"react"` |
| **0-20** | Partial | Some characters match |

---

## Platform Pattern

```mermaid
classDiagram
    class Platform {
        <<abstract>>
        +name: string
        +id: string
        +urlPattern: RegExp
        +run(page, profile) ApplicationResult
        #fill(ctx)*
        #submit(ctx)*
        #getConfirmation(ctx)*
    }
    
    class AcmePlatform {
        +name = "Acme Corp"
        +urlPattern = /acme/
        #fill() 4-step wizard
        #submit() Continue buttons
        #getConfirmation() .confirmation-id
    }
    
    class GlobexPlatform {
        +name = "Globex Corp"
        +urlPattern = /globex/
        #fill() Accordion sections
        #submit() Toggle + slider
        #getConfirmation() .confirmation-code
    }
    
    class NewPlatform {
        +name = "Your ATS"
        +urlPattern = /yoursite/
        #fill() Your form logic
        #submit() Your submit
        #getConfirmation() Your selector
    }
    
    Platform <|-- AcmePlatform
    Platform <|-- GlobexPlatform
    Platform <|-- NewPlatform
```

### Platform Comparison

```mermaid
mindmap
  root((Platforms))
    Acme Corp
      4-step wizard
      Continue buttons
      Checkboxes for skills
      Radio buttons for Y/N
      Sync typeahead
      Text input salary
    Globex Corp
      Accordion sections
      Section headers
      Clickable chips
      Toggle switch
      Async typeahead
      Range slider salary
```

---

## Stealth Mode

```mermaid
flowchart LR
    subgraph Detection["🔍 Detection Vectors"]
        D1[navigator.webdriver = true]
        D2[Empty plugins array]
        D3[Straight mouse lines]
        D4[Instant typing]
        D5[Zero typos]
        D6[Fixed viewport]
        D7[Same user agent]
    end
    
    subgraph Patches["🛡️ Stealth Patches"]
        P1[webdriver = undefined]
        P2[Fake plugins array]
        P3[Bezier curves]
        P4[45-140ms delays]
        P5[2% typo rate]
        P6[Random viewports]
        P7[Rotated 2026 UAs]
    end
    
    D1 --> P1
    D2 --> P2
    D3 --> P3
    D4 --> P4
    D5 --> P5
    D6 --> P6
    D7 --> P7
```

---

## Artifacts Structure

```mermaid
flowchart TD
    A[artifacts/] --> B[screenshots/]
    A --> C[failures/]
    A --> D[reports/]
    
    B --> B1[acme-success-*.png]
    B --> B2[globex-success-*.png]
    
    C --> C1[platform-step-failure-*.png]
    
    D --> D1[platform-submission-*.json]
    
    D1 --> E["{ platform, confirmationId,<br/>duration, steps[], timestamp }"]
```

---

## Adding a New Platform

```mermaid
flowchart LR
    A[1. Create file<br/>platforms/new.ts] --> B[2. Extend Platform<br/>abstract class]
    B --> C[3. Implement methods<br/>fill, submit, getConfirmation]
    C --> D[4. Call registerPlatform<br/>at module load]
    D --> E[5. Import in<br/>automator.ts]
    E --> F[✅ Auto-detects<br/>by URL pattern]
    
    style F fill:#10b981
```

---

## Key Decisions

```mermaid
mindmap
  root((Design Decisions))
    Human Behavior
      Paste URLs
        Typing links is MORE suspicious
      Bezier curves
        Straight lines = bot signature
      2% typos
        Pass validation, look human
      Varied input
        Real humans are inconsistent
    Reliability
      Exponential backoff
        Gentle on system
      Circuit breaker
        Stop runaway failures
      Fuzzy typeahead
        Handle async shuffled results
    Architecture
      Scoped selectors
        Avoid multi-match errors
      State waits
        More reliable than fixed delays
      Platform registry
        Auto-detection by URL
```
