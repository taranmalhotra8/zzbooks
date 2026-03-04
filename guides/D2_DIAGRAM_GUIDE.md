# D2 Diagram Guide for Zopdev Ebooks

This guide shows you how to create professional diagrams for ebooks using D2 — a modern diagram scripting language that generates beautiful architecture diagrams, workflow visualizations, and system layouts.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Setup](#setup)
3. [Using Diagram Templates](#using-diagram-templates)
4. [Zopdev Brand Colors](#zopdev-brand-colors)
5. [D2 Syntax Basics](#d2-syntax-basics)
6. [Layout Engines](#layout-engines)
7. [Common Patterns](#common-patterns)
8. [Troubleshooting](#troubleshooting)
9. [Best Practices](#best-practices)

---

## Quick Start

1. **Copy a template** from `_diagrams/templates/` to your book's `diagrams/` directory
2. **Edit the D2 file** with your content
3. **Embed in your chapter** using the `d2` code fence
4. **Render** with `make render ebook=<slug>`

Example:

```markdown
```{d2}
aws: AWS Cloud {
  ec2: EC2 Instance
  rds: RDS Database
}

ec2 -> rds: SQL queries
```
```

---

## Setup

### Prerequisites

1. **Install D2 CLI** (required for local preview):
   ```bash
   # macOS
   brew install d2

   # Linux
   curl -fsSL https://d2lang.com/install.sh | sh -s --

   # Verify installation
   d2 --version
   ```

2. **Install Quarto D2 extension** (per-ebook):
   ```bash
   cd books/<your-ebook-slug>
   quarto install extension data-intuitive/quarto-d2
   ```

   This adds `filters: [d2]` to your `_quarto.yml` config automatically.

3. **Create diagrams directory** (if it doesn't exist):
   ```bash
   mkdir -p books/<your-ebook-slug>/diagrams
   ```

---

## Using Diagram Templates

Zopdev provides 5 pre-built diagram templates optimized for FinOps/cloud content. All templates use Zopdev brand colors and follow best practices.

### Available Templates

| Template | Purpose | Use When |
|----------|---------|----------|
| **cloud-architecture.d2** | Infrastructure with cost annotations | Showing cloud resources with $ amounts |
| **finops-workflow.d2** | FinOps lifecycle (Inform → Optimize → Operate) | Explaining FinOps processes |
| **before-after-optimization.d2** | Side-by-side cost optimization | Demonstrating savings impact |
| **multi-cloud-comparison.d2** | AWS vs GCP vs Azure | Comparing cloud providers |
| **data-pipeline.d2** | ETL/analytics workflows | Showing data flows with cost awareness |

### Copy a Template

**Method 1: Manual Copy**
```bash
cp _diagrams/templates/cloud-architecture.d2 books/<your-slug>/diagrams/my-diagram.d2
```

**Method 2: Using Utility (future)**
```bash
bun run scripts/diagram-utils.ts copy cloud-architecture my-ebook
```

### Embed in Chapter

Once you have a `.d2` file in your `diagrams/` directory, embed it in your chapter:

```markdown
## Architecture Overview

```{d2}
//| file: diagrams/my-diagram.d2
//| fig-cap: "Production infrastructure with cost breakdown"
//| fig-width: 8
```
```

Or inline:

```markdown
```{d2}
x -> y: Connection
y -> z: Data flow
```
```

---

## Zopdev Brand Colors

Use these hex codes to maintain brand consistency in your diagrams:

| Color | Hex | Use For |
|-------|-----|---------|
| **Primary Blue** | `#0891b2` | Main elements, primary actions, Zopdev products |
| **Success Green** | `#16a34a` | Savings, optimization wins, positive outcomes |
| **Warning Orange** | `#fbbf24` | Alerts, moderate issues, attention needed |
| **Danger Red** | `#ef4444` | Problems, waste, over-spend |
| **Dark Blue** | `#0e7490` | Borders, secondary elements |
| **Light Blue** | `#e3f2fd` | Backgrounds, containers |

### Color Usage Examples

```d2
# Primary element
zopnight: ZopNight {
  style.fill: "#0891b2"
  style.font-color: "#ffffff"
}

# Success/savings indicator
savings_badge: Potential Savings: $18K/month {
  style.fill: "#16a34a"
  style.font-color: "#ffffff"
}

# Warning/alert
cost_spike: Cost Spike Detected {
  style.fill: "#fbbf24"
  style.font-color: "#000000"
}

# Problem/waste
idle_resources: Idle Resources: $5K/month waste {
  style.fill: "#ef4444"
  style.font-color: "#ffffff"
}
```

---

## D2 Syntax Basics

### Nodes and Connections

```d2
# Basic node
server: Web Server

# Node with shape
database: Database {
  shape: cylinder
}

# Connection
server -> database: SQL queries
```

### Containers (Nested Shapes)

```d2
aws: AWS Cloud {
  vpc: Production VPC {
    ec2: EC2 Instances
    rds: RDS Database
  }
}

# Connection between nested elements
aws.vpc.ec2 -> aws.vpc.rds
```

### Styling

```d2
# Fill color
box: Box {
  style.fill: "#0891b2"
  style.stroke: "#0e7490"
  style.font-color: "#ffffff"
}

# Stroke and width
important: Important Element {
  style.stroke: "#ef4444"
  style.stroke-width: 3
  style.bold: true
}

# Shadow
card: Card {
  style.shadow: true
  style.fill: "#ffffff"
}
```

### Text Annotations

```d2
# Simple label
cost_label: $45K/month {
  shape: text
  style.font-size: 14
  style.bold: true
}

# Markdown content
description: Info Box {
  shape: rectangle
  style.fill: "#e3f2fd"

  details: |md
    - Auto-scaling enabled
    - Multi-AZ deployment
    - **Cost**: $3,200/month
  |
}
```

### Directional Layout

```d2
direction: right  # Options: up, down, left, right

A -> B -> C -> D
```

---

## Layout Engines

D2 supports multiple layout engines. Choose based on your diagram type:

| Engine | Best For | Use When |
|--------|----------|----------|
| **elk** (default) | Hierarchical layouts, org charts | Cloud architectures, nested containers |
| **dagre** | Directed acyclic graphs | Data pipelines, workflow sequences |
| **tala** | Large complex diagrams | Network topologies, service meshes |

### Setting Layout Engine

```d2
vars: {
  d2-config: {
    layout-engine: elk
    pad: 20
  }
}
```

### Layout Tips

- **elk**: Works best with `direction: right` or `direction: down`
- **dagre**: Handles long chains well, good for pipelines
- **tala**: Slow but produces clean results for complex diagrams

---

## Common Patterns

### Pattern 1: Cloud Infrastructure with Cost Labels

```d2
aws: AWS Cloud {
  style.fill: "#FF9900"
  style.fill-opacity: 0.1
  style.stroke: "#FF9900"

  vpc: Production VPC {
    style.fill: "#ffffff"
    style.stroke: "#0891b2"
    style.stroke-width: 2

    cost: $45K/month {
      shape: text
      style.font-color: "#0891b2"
      style.bold: true
    }

    alb: Load Balancer {
      style.fill: "#FF9900"

      alb_cost: $250/mo {
        shape: text
        style.font-size: 10
      }
    }

    eks: EKS Cluster {
      style.fill: "#0891b2"
      style.font-color: "#ffffff"

      eks_cost: $3,317/mo {
        shape: text
        style.font-size: 10
      }
    }
  }
}

# Savings badge
savings: Potential Savings: $18K/month {
  shape: circle
  style.fill: "#16a34a"
  style.font-color: "#ffffff"
  style.shadow: true
}

aws -> savings: Optimization {
  style.stroke: "#16a34a"
  style.stroke-dash: 3
}
```

### Pattern 2: Before/After Comparison

```d2
direction: right

before: BEFORE {
  shape: rectangle
  style.fill: "#ffebee"
  style.stroke: "#ef4444"
  style.stroke-width: 2

  cost: $45K/month {
    shape: text
    style.font-size: 16
    style.bold: true
  }

  resources: |md
    - 12 m5.2xlarge (overprovisioned)
    - No scheduling
    - On-demand only
  |
}

after: AFTER {
  shape: rectangle
  style.fill: "#e8f5e9"
  style.stroke: "#16a34a"
  style.stroke-width: 2

  cost: $27K/month {
    shape: text
    style.font-size: 16
    style.bold: true
  }

  resources: |md
    - 8 m5.xlarge (right-sized)
    - Scheduled stop/start
    - 70% reserved, 30% spot
  |
}

before -> after: Optimization {
  style.stroke: "#16a34a"
  style.stroke-width: 3
}

savings: Savings: $18K/month (40%) {
  shape: circle
  style.fill: "#16a34a"
  style.font-color: "#ffffff"
  style.font-size: 14
}

after -> savings {
  style.stroke: "#16a34a"
  style.stroke-dash: 3
}
```

### Pattern 3: Workflow/Process

```d2
direction: down

step1: 1. Connect Accounts {
  style.fill: "#e3f2fd"
  style.stroke: "#0891b2"

  tasks: |md
    - Link AWS, GCP, Azure
    - Aggregate billing data
  |
}

step2: 2. Analyze Costs {
  style.fill: "#fff3e0"
  style.stroke: "#fbbf24"

  tasks: |md
    - Identify waste
    - Find savings opportunities
  |
}

step3: 3. Implement Changes {
  style.fill: "#e8f5e9"
  style.stroke: "#16a34a"

  tasks: |md
    - Right-size resources
    - Purchase reservations
  |
}

step1 -> step2: Data-Driven Insights
step2 -> step3: Recommendations
```

---

## Troubleshooting

### Problem: "D2 CLI not found"

**Solution:**
```bash
# Install D2
brew install d2  # macOS
# or
curl -fsSL https://d2lang.com/install.sh | sh -s --

# Verify
d2 --version
```

### Problem: "Quarto can't find d2 filter"

**Solution:**
```bash
# Install extension in your ebook directory
cd books/<your-slug>
quarto install extension data-intuitive/quarto-d2

# Verify _quarto.yml has:
# filters: [d2]
```

### Problem: Diagram doesn't render in PDF/EPUB

**Cause:** D2 generates SVG, which should work in all formats.

**Solutions:**
- Check that D2 CLI is installed and working
- Verify the `.d2` syntax is valid: `d2 validate diagrams/your-diagram.d2`
- Try rendering PDF with `--verbose` flag to see errors

### Problem: Layout looks messy

**Solutions:**
- Try a different layout engine: `dagre`, `elk`, or `tala`
- Add explicit `direction:` (up, down, left, right)
- Increase padding: `pad: 40`
- Break complex diagrams into multiple smaller diagrams

### Problem: Colors don't match brand

**Solution:**
Use the Zopdev color palette (see [Zopdev Brand Colors](#zopdev-brand-colors) section). All templates use correct colors.

---

## Best Practices

### 1. Use Templates as Starting Points

Don't start from scratch. Copy a template that's close to your needs and modify it.

### 2. Keep Diagrams Focused

- **One concept per diagram** — Don't try to show everything at once
- **5-10 nodes maximum** — More than that gets cluttered
- **Split complex diagrams** — Use multiple simpler diagrams instead of one complex one

### 3. Add Cost Annotations

For FinOps content, always include:
- Dollar amounts (`$45K/month`)
- Savings deltas (`Saves $18K/month`)
- Percentage improvements (`40% reduction`)

### 4. Use Consistent Styling

- **Containers**: White fill, colored border
- **Active resources**: Colored fill (blue, green, orange)
- **Cost labels**: Text shape, bold, sized 10-14
- **Savings badges**: Circle shape, green fill, white text

### 5. Test in All Formats

Always verify your diagram renders correctly in:
- HTML (primary format)
- PDF (print/offline)
- EPUB (mobile/tablet)

### 6. Caption and Context

Every diagram should have:
- **Figure caption**: `fig-cap: "Production infrastructure with cost breakdown"`
- **Context paragraph**: Explain what the diagram shows before showing it
- **Call-out**: Reference key elements after the diagram

Example:

```markdown
Figure 3 shows our production infrastructure before optimization. Notice
the 12 overprovisioned m5.2xlarge instances (shown in red), which account
for $3,317/month in unnecessary spend.

```{d2}
//| file: diagrams/before-optimization.d2
//| fig-cap: "Production infrastructure before optimization"
```
```

After right-sizing to m5.xlarge instances and implementing scheduling, we
reduced compute costs by 40% while maintaining performance (Figure 4).
```

### 7. Version Control Diagrams

- **Store `.d2` source files** in `books/<slug>/diagrams/`
- **Don't commit rendered SVG** — Quarto generates these automatically
- **Use descriptive filenames**: `prod-architecture-before.d2`, not `diagram1.d2`

### 8. Validate Before Committing

```bash
# Validate D2 syntax
make diagrams ebook=<your-slug>

# Or directly:
d2 validate books/<your-slug>/diagrams/*.d2
```

---

## When to Use D2 vs. Mermaid

| Feature | D2 | Mermaid |
|---------|-----|---------|
| **Cloud architectures** | ✅ **Best choice** — Fine control over layout and styling | ⚠️ Limited — Basic shapes only |
| **Workflow/process flows** | ✅ Good — Flexible styling | ✅ **Best choice** — Built-in flowchart syntax |
| **Sequence diagrams** | ❌ Not supported | ✅ **Best choice** — Native support |
| **Gantt charts** | ❌ Not supported | ✅ **Best choice** — Native support |
| **Cost annotations** | ✅ **Best choice** — Full control | ⚠️ Limited — Hacky workarounds |
| **Brand styling** | ✅ **Best choice** — Precise color control | ⚠️ Limited — Theme-based only |
| **Complexity** | ⚠️ More verbose | ✅ More concise |

**Rule of thumb:**
- **Use D2** for cloud architectures, infrastructure diagrams, and anything needing precise styling/cost labels
- **Use Mermaid** for simple flowcharts, sequence diagrams, and Gantt charts

---

## Additional Resources

- **D2 Official Docs**: https://d2lang.com/
- **D2 Playground**: https://play.d2lang.com/ (test syntax online)
- **Quarto D2 Extension**: https://github.com/data-intuitive/quarto-d2
- **Zopdev Template Library**: `_diagrams/templates/` (5 reusable templates)

---

## Examples in This Ebook

See these chapters for working D2 examples:
- Chapter 5: Optimization Strategies (before/after diagrams)
- Chapter 4: Cost Allocation (tagging workflow)
- Chapter 3: Visibility (multi-cloud comparison)

**Questions?** Check `scripts/diagram-utils.ts` for utility functions, or ask in #ebook-engine Slack.
