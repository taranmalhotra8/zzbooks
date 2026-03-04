# Zopdev SOTA Ebook Generation System - Upgrade Roadmap

## Executive Summary

Transform the ebook generator from "basic PDF output" to "premium technical publishing system" that rivals AWS, Stripe, and Datadog documentation quality.

**Target Outcome:** Ebooks that look and feel like $Million engineering guides - expensive, premium, authoritative.

---

## Phase 1: Visual Foundation (Week 1-2)

### 1.1 Quarto Theme System - "Zopdev Premium"

**Objective:** Create a custom Quarto theme that screams "high-end technical publisher"

**Components:**

```yaml
# _quarto.yml - Master Configuration
project:
  type: book
  output-dir: _site

book:
  title: "The FinOps Playbook"
  subtitle: "A Practical Guide to Cloud Financial Management"
  author: "Zopdev Engineering"
  cover-image: assets/cover-premium.png
  
format:
  html:
    theme: 
      - cosmo
      - custom-zopdev.scss
    css: 
      - styles/premium-layout.css
      - styles/code-blocks.css
      - styles/diagrams.css
    code-copy: true
    code-overflow: wrap
    toc: true
    toc-depth: 3
    number-sections: true
    
  pdf:
    documentclass: report
    classoption: [oneside, 11pt]
    geometry:
      - margin=1in
      - paperwidth=8.5in
      - paperheight=11in
    pdf-engine: xelatex
    include-in-header:
      text: |
        \usepackage{tcolorbox}
        \usepackage{fontspec}
        \setmainfont{Inter}
        \setmonofont{JetBrains Mono}
        \definecolor{zopblue}{HTML}{0052FF}
        \definecolor{zopgray}{HTML}{1a1a1a}
```

### 1.2 Custom SCSS Theme - "Engineering Grade"

Create `/styles/custom-zopdev.scss`:

```scss
/*-- scss:defaults --*/

// Zopdev Brand Colors
$primary: #0891b2;
$secondary: #155e75;
$success: #16a34a;
$warning: #fbbf24;
$danger: #ef4444;

// Sophisticated Grays
$body-bg: #ffffff;
$body-color: #1a1a1a;
$text-muted: #6c757d;
$border-color: #e1e4e8;

// Premium Typography
$font-family-sans-serif: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
$font-family-monospace: "JetBrains Mono", "Fira Code", Consolas, monospace;
$font-size-base: 1.0625rem; // 17px for readability
$line-height-base: 1.7;

// Spacing for breathing room
$spacer: 1rem;
$headings-margin-bottom: 1.5rem;

/*-- scss:rules --*/

// Premium Title Block
.quarto-title-block {
  background: linear-gradient(135deg, #0891b2 0%, #155e75 100%);
  color: white;
  padding: 4rem 2rem;
  margin-bottom: 3rem;
  border-radius: 0 0 8px 8px;
  
  .quarto-title {
    font-size: 3rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    margin-bottom: 1rem;
  }
  
  .quarto-title-meta {
    font-size: 1.1rem;
    opacity: 0.9;
  }
}

// Chapter Headers - Engineering Style
h1, h2, h3 {
  font-weight: 700;
  letter-spacing: -0.01em;
  margin-top: 2.5rem;
}

h1 {
  font-size: 2.5rem;
  border-bottom: 3px solid $primary;
  padding-bottom: 0.5rem;
  margin-bottom: 2rem;
}

h2 {
  font-size: 1.875rem;
  color: #2c3e50;
  
  &::before {
    content: "▸ ";
    color: $primary;
    font-weight: 900;
  }
}

h3 {
  font-size: 1.5rem;
  color: #34495e;
}

// Premium Code Blocks
pre.sourceCode {
  background: #f6f8fa;
  border: 1px solid #e1e4e8;
  border-left: 4px solid $primary;
  border-radius: 6px;
  padding: 1.25rem;
  font-size: 0.9375rem;
  line-height: 1.6;
  overflow-x: auto;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  
  code {
    background: transparent;
    font-family: $font-family-monospace;
  }
}

// Inline code - subtle highlight
code {
  background: #f1f3f5;
  color: #c7254e;
  padding: 0.2em 0.4em;
  border-radius: 3px;
  font-size: 0.9em;
  font-family: $font-family-monospace;
}

// Callout Boxes - Premium Style
.callout {
  border-radius: 8px;
  padding: 1.25rem;
  margin: 1.5rem 0;
  border-left: 5px solid;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  
  &.callout-tip {
    background: #e8f5e9;
    border-left-color: #16a34a;
    
    .callout-icon {
      color: #16a34a;
    }
  }
  
  &.callout-note {
    background: #e3f2fd;
    border-left-color: #0891b2;
    
    .callout-icon {
      color: #0891b2;
    }
  }
  
  &.callout-warning {
    background: #fff3e0;
    border-left-color: #fbbf24;
    
    .callout-icon {
      color: #fbbf24;
    }
  }
  
  .callout-title {
    font-weight: 700;
    font-size: 1.1rem;
    margin-bottom: 0.75rem;
  }
}

// Tables - Clean, readable
table {
  border-collapse: collapse;
  width: 100%;
  margin: 2rem 0;
  font-size: 0.95rem;
  
  thead {
    background: #f8f9fa;
    border-bottom: 2px solid $primary;
    
    th {
      padding: 1rem;
      text-align: left;
      font-weight: 700;
      color: #2c3e50;
    }
  }
  
  tbody {
    tr {
      border-bottom: 1px solid #e1e4e8;
      
      &:hover {
        background: #f8f9fa;
      }
      
      td {
        padding: 1rem;
      }
    }
  }
}

// Links - Subtle but clear
a {
  color: $primary;
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: all 0.2s ease;
  
  &:hover {
    border-bottom-color: $primary;
  }
}

// Blockquotes - Engineering wisdom
blockquote {
  border-left: 4px solid $primary;
  padding-left: 1.5rem;
  margin: 2rem 0;
  font-style: italic;
  color: #495057;
  background: #f8f9fa;
  padding: 1rem 1.5rem;
  border-radius: 0 4px 4px 0;
}

// Figure captions
figcaption {
  text-align: center;
  font-style: italic;
  color: $text-muted;
  margin-top: 0.5rem;
  font-size: 0.9rem;
}

// TOC Styling
#TOC {
  background: #f8f9fa;
  padding: 1.5rem;
  border-radius: 8px;
  border: 1px solid #e1e4e8;
  
  ul {
    list-style: none;
    padding-left: 0;
    
    li {
      margin: 0.5rem 0;
      
      a {
        color: #2c3e50;
        border-bottom: none;
        
        &:hover {
          color: $primary;
        }
      }
    }
  }
}
```

### 1.3 Premium Layout Enhancements

Create `/styles/premium-layout.css`:

```css
/* Wide-screen optimization */
@media (min-width: 1400px) {
  .quarto-container {
    max-width: 1320px;
  }
}

/* Column-screen for diagrams */
.column-screen {
  width: 100vw;
  margin-left: calc(-50vw + 50%);
  margin-right: calc(-50vw + 50%);
  padding: 2rem 0;
  background: #f8f9fa;
}

/* Margin notes for technical asides */
.column-margin {
  float: right;
  clear: right;
  width: 300px;
  margin-right: -340px;
  margin-top: 0;
  margin-bottom: 1rem;
  font-size: 0.875rem;
  line-height: 1.6;
  color: #6c757d;
  padding: 1rem;
  background: #f8f9fa;
  border-left: 3px solid #0891b2;
  border-radius: 4px;
}

/* Hero sections at chapter starts */
.hero-section {
  background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
  padding: 3rem 2rem;
  margin: 2rem 0;
  border-radius: 8px;
  border: 1px solid #e1e4e8;
}

/* Premium image containers */
.premium-image {
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  margin: 2rem 0;
  overflow: hidden;
}

/* Lightbox effect preparation */
.lightbox-enabled {
  cursor: zoom-in;
  transition: transform 0.2s ease;
}

.lightbox-enabled:hover {
  transform: scale(1.02);
}
```

---

## Phase 2: Diagram System - "Architecture as Code" (Week 2-3)

### 2.1 Install D2 Lang (Superior to Mermaid)

**Why D2 over Mermaid:**
- Better layout algorithms
- Professional aesthetics out of the box
- AWS/GCP/Azure icon support
- Handles complex architectures without "spaghetti"

**Installation:**

```bash
# Install D2
curl -fsSL https://d2lang.com/install.sh | sh -s --

# Install Quarto D2 extension
quarto install extension data-intuitive/quarto-d2
```

### 2.2 D2 Diagram Templates for FinOps

Create `/diagrams/templates/`:

**Template 1: Cloud Architecture**
```d2
# diagrams/templates/cloud-architecture.d2
direction: right

vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

style: {
  font: "Inter"
  font-size: 14
  stroke-width: 2
}

cloud: AWS Cloud {
  style.fill: "#FF9900"
  style.stroke: "#FF9900"
  
  vpc: VPC {
    style.fill: "#ffffff"
    style.stroke: "#0891b2"
    
    cluster: EKS Cluster {
      style.fill: "#e3f2fd"
      
      nodes: EC2 Instances {
        style.fill: "#0891b2"
        style.font-color: "#ffffff"
      }
      
      pods: Application Pods {
        style.fill: "#16a34a"
        style.font-color: "#ffffff"
      }
    }
  }
  
  monitoring: CloudWatch {
    style.fill: "#fbbf24"
  }
}

zopnight: ZopNight Agent {
  style.fill: "#0891b2"
  style.stroke: "#155e75"
  style.font-color: "#ffffff"
  style.shadow: true
}

cloud.cluster -> zopnight: Metrics
zopnight -> cloud.cluster: Schedule Actions
cloud.monitoring -> zopnight: Cost Data
```

**Template 2: FinOps Workflow**
```d2
# diagrams/templates/finops-workflow.d2
direction: down

inform: Inform Phase {
  shape: rectangle
  style.fill: "#e3f2fd"
  style.stroke: "#0891b2"
  
  visibility: "Visibility\n80% Tag Coverage"
  allocation: "Allocation\nTeam-wise costs"
  benchmarking: "Benchmarking\nCost per customer"
}

optimize: Optimize Phase {
  shape: rectangle
  style.fill: "#e8f5e9"
  style.stroke: "#16a34a"
  
  rate: "Rate Optimization\n40% RI coverage"
  usage: "Usage Optimization\nRight-sizing"
  architecture: "Architectural\nServerless migration"
}

operate: Operate Phase {
  shape: rectangle
  style.fill: "#fff3e0"
  style.stroke: "#fbbf24"
  
  governance: "Governance\nTagging policies"
  automation: "Automation\nCost alerts"
  improvement: "Continuous Improvement\nQuarterly reviews"
}

inform -> optimize: Actions
optimize -> operate: Sustain
operate -> inform: Feedback {
  style.stroke-dash: 5
}
```

### 2.3 Custom Mermaid Styling (For Simple Diagrams)

Create `/diagrams/mermaid-config.json`:

```json
{
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#ffffff",
    "primaryTextColor": "#1a1a1a",
    "primaryBorderColor": "#0891b2",
    "lineColor": "#6c757d",
    "secondaryColor": "#f8f9fa",
    "tertiaryColor": "#ffffff",
    "fontSize": "14px",
    "fontFamily": "Inter"
  },
  "flowchart": {
    "curve": "linear",
    "padding": 20,
    "nodeSpacing": 80,
    "rankSpacing": 80,
    "diagramPadding": 20
  }
}
```

### 2.4 Diagram Integration Workflow

```markdown
# In your .qmd files:

## System Architecture

::: {.column-page}
```{d2}
//| file: diagrams/cloud-architecture.d2
//| width: 100%
```
:::

## FinOps Lifecycle

```{mermaid}
%%{init: {'theme':'base', 'themeVariables': {'primaryColor':'#ffffff'}}}%%
graph TD
    A[Inform] --> B[Optimize]
    B --> C[Operate]
    C --> A
    
    classDef default fill:#fff,stroke:#0891b2,stroke-width:2px
```
```

---

## Phase 3: Content Quality Transformation (Week 3-4)

### 3.1 Content Rewrite Framework - "Scenario-First"

**Current Problem:** Generic advice like "right-size your instances"

**SOTA Approach:** Incident-response scenarios with actual data

**Template:**

```markdown
## The $50K/Month Database Leak

**The Incident:**
At 3:17 AM on a Tuesday, the FinOps Slack bot fired an alert: RDS spend had
spiked 400% in the last 6 hours. What should have been a $12,000/month 
PostgreSQL cluster was now running at $50,000/month.

**The Investigation:**
```sql
-- Query the Cost and Usage Report
SELECT 
  line_item_resource_id,
  line_item_usage_type,
  SUM(line_item_unblended_cost) as cost
FROM cur_database
WHERE line_item_product_code = 'AmazonRDS'
  AND line_item_usage_start_date >= '2025-01-15'
GROUP BY 1, 2
ORDER BY 3 DESC
LIMIT 10;
```

**The Root Cause:**
A dev accidentally enabled Multi-AZ and provisioned IOPS (io2) on a 
staging database that only needed gp3. The combination turned a 
$400/month instance into a $16,000/month instance.

**The Zopnight Solution:**
```yaml
# zopnight-policy.yaml
policies:
  - name: block-expensive-db-configs
    resource: rds
    filters:
      - type: value
        key: StorageType
        value: io2
      - type: tag-count
        count: 0
        key: approved-iops
    actions:
      - type: notify
        to: 
          - slack://finops-alerts
        message: |
          ⚠️ io2 RDS instance detected without approval tag
          Resource: {resource_id}
          Estimated monthly cost: ${monthly_cost}
      - type: stop
```

**Lessons:**
1. Policy-as-code prevents expensive configs before they're deployed
2. Tagging exceptions (approved-iops) allows intentional high-cost resources
3. Automatic alerting catches misconfigurations in hours, not weeks
```

### 3.2 Code Examples - Production-Ready Quality

**Bad Example (Current):**
```
"Use lifecycle policies to move data to cheaper storage tiers"
```

**SOTA Example:**
```markdown
### Storage Lifecycle Automation - Save 60% on S3 Costs

**The Scenario:**
Your SaaS product generates 2TB of user reports monthly. Reports are 
accessed frequently for 30 days, occasionally for 90 days, and almost 
never after that. Current cost: $46/TB/month (S3 Standard) = $92,000/year.

**The Terraform Implementation:**
```hcl
resource "aws_s3_bucket_lifecycle_configuration" "user_reports" {
  bucket = aws_s3_bucket.reports.id

  rule {
    id     = "optimize-report-storage"
    status = "Enabled"

    # Hot tier: First 30 days
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    # Warm tier: 30-90 days  
    transition {
      days          = 90
      storage_class = "GLACIER_IR"
    }

    # Cold tier: 90-365 days
    transition {
      days          = 365
      storage_class = "DEEP_ARCHIVE"
    }

    # Cleanup: After 7 years (compliance requirement)
    expiration {
      days = 2555
    }
  }
}
```

**The Math:**
```
Month 0-1:  2TB × $23/TB = $46   (Standard)
Month 1-3:  2TB × $12.50/TB = $25 (Standard-IA)
Month 3-12: 2TB × $4/TB = $8      (Glacier IR)
Year 2-7:   2TB × $1/TB = $2      (Deep Archive)

First year average: ~$18/TB (vs $23) = 22% savings
Steady state: ~$8/TB (vs $23) = 65% savings
Annual savings at 24TB/year: $360,000
```

**Implementation Checklist:**
- [ ] Analyze access patterns with S3 Analytics
- [ ] Test retrieval times for Glacier IR (verify <5min SLA)
- [ ] Update application to handle lifecycle transitions
- [ ] Set up CloudWatch alerts for retrieval costs
- [ ] Document compliance retention requirements
```

### 3.3 Visual Data Presentations

**Add Observable JS Cost Calculators:**

```javascript
//| echo: false
viewof monthly_instances = Inputs.range([10, 10000], {
  value: 100,
  step: 10,
  label: "Number of EC2 instances"
})

viewof hours_per_day = Inputs.range([1, 24], {
  value: 12,
  step: 1,
  label: "Average hours running per day"
})

viewof instance_cost = Inputs.range([0.01, 1], {
  value: 0.10,
  step: 0.01,
  label: "Hourly instance cost ($)"
})

// Calculate costs
monthly_on_demand = monthly_instances * hours_per_day * 30 * instance_cost
monthly_with_scheduling = monthly_instances * hours_per_day * 30 * instance_cost

savings = monthly_on_demand - monthly_with_scheduling
savings_percent = (savings / monthly_on_demand * 100).toFixed(1)

html`
<div style="background: linear-gradient(135deg, #0891b2 0%, #155e75 100%); 
            color: white; padding: 2rem; border-radius: 8px; margin: 2rem 0;">
  <h3 style="margin-top: 0;">ZopNight Scheduling Savings</h3>
  <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1.5rem;">
    <div>
      <div style="font-size: 0.875rem; opacity: 0.8;">Monthly Cost (24/7)</div>
      <div style="font-size: 2rem; font-weight: 700;">$${monthly_on_demand.toLocaleString()}</div>
    </div>
    <div>
      <div style="font-size: 0.875rem; opacity: 0.8;">With Scheduling</div>
      <div style="font-size: 2rem; font-weight: 700;">$${monthly_with_scheduling.toLocaleString()}</div>
    </div>
    <div>
      <div style="font-size: 0.875rem; opacity: 0.8;">Monthly Savings</div>
      <div style="font-size: 2rem; font-weight: 700; color: #16a34a;">
        $${savings.toLocaleString()} (${savings_percent}%)
      </div>
    </div>
  </div>
</div>
`
```

---

## Phase 4: Premium Assets & Brand Identity (Week 4-5)

### 4.1 Cover Image Generation

**DALL-E 3 Prompt for Covers:**

```
Create a premium technical book cover in a minimalist, high-tech style:

Visual Elements:
- Abstract 3D isometric cloud infrastructure wireframes
- Glass-morphism effect with translucent surfaces
- Glowing network nodes in electric blue (#0891b2)
- Clean geometric shapes suggesting data flow
- Subtle gradient from deep blue to white
- Professional, not playful

Technical Aesthetic:
- Engineering documentation style
- Similar to Stripe/Vercel brand design
- Clean lines, high contrast
- 8k resolution, crisp edges
- White background with blue accents

Mood: Premium, authoritative, cutting-edge
--ar 16:9 --style raw --v 6
```

### 4.2 In-Book Visual Assets

**Dashboard Screenshots:**
- Use Figma to create mockup dashboards
- Show real (but sanitized) data
- Highlight ZopNight features
- Include annotations

**Icon System:**
- Use Lucide icons consistently
- AWS/GCP/Azure official logos
- Custom FinOps phase icons

### 4.3 Image Placement Strategy

```markdown
# Chapter Opening - Hero Image
::: {.column-screen}
![](assets/chapter-3-hero.png){.premium-image}
:::

# Margin Technical Diagrams
![Zopnight Agent Architecture](diagrams/agent-arch.svg){.column-margin}

# Full-Width Architecture
::: {.column-page}
```{d2}
//| file: diagrams/multi-cloud-setup.d2
```
:::

# Lightbox for Screenshots
![ZopNight Dashboard](assets/dashboard-main.png){group="ui-gallery"}
```

---

## Phase 5: Interactive & Dynamic Content (Week 5-6)

### 5.1 WebR for Live Code Execution

```markdown
## Try Right-Sizing Calculator

```{webr-r}
# Interactive R code that runs in browser
instances <- 100
current_size <- "m5.2xlarge"
recommended_size <- "m5.xlarge"

current_cost <- instances * 0.384 * 730  # hourly rate × hours/month
optimized_cost <- instances * 0.192 * 730

savings <- current_cost - optimized_cost
savings_pct <- (savings / current_cost) * 100

cat(sprintf("Current monthly cost: $%,.0f\n", current_cost))
cat(sprintf("Optimized monthly cost: $%,.0f\n", optimized_cost))
cat(sprintf("Monthly savings: $%,.0f (%.1f%%)\n", savings, savings_pct))
```
```

### 5.2 Quarto Live Components

Enable real-time Python/R code execution:

```yaml
# In _quarto.yml
format:
  html:
    resources:
      - "webr-serviceworker.js"
      - "webr-worker.js"
    filters:
      - webr
```

---

## Phase 6: Multi-Book Hub System (Week 6-7)

### 6.1 Directory Structure

```
zop-technical-library/
├── _quarto.yml                    # Hub config
├── index.qmd                      # Landing page
├── styles/
│   ├── custom-zopdev.scss
│   ├── premium-layout.css
│   └── code-blocks.css
├── ebooks/
│   ├── finops-playbook/
│   │   ├── _quarto.yml
│   │   ├── index.qmd
│   │   ├── chapters/
│   │   ├── diagrams/
│   │   └── assets/
│   ├── kubernetes-cost-optimization/
│   ├── cloud-architecture-patterns/
│   └── zopnight-field-manual/
├── shared/
│   ├── diagrams/templates/
│   └── assets/brand/
└── scripts/
    ├── render-all.sh
    └── deploy.sh
```

### 6.2 Automated Library Page

```markdown
---
title: "Zopdev Technical Library"
subtitle: "Engineering Field Manuals for Cloud Operations"
listing:
  contents: "ebooks/*/index.qmd"
  type: grid
  sort: "date desc"
  categories: true
  fields: [image, title, subtitle, date, categories]
  grid-columns: 3
  image-height: 250px
---

## Premium Technical Guides

Our field manuals are rendered directly from production systems and 
operational data. Each guide is continuously updated as we discover 
new optimization patterns at scale.

::: {.callout-note}
## Open Source Philosophy
All ebooks are generated from our internal runbooks. If you see a gap 
or want to contribute, submit a PR to our technical library repo.
:::
```

---

## Phase 7: Content Quality Framework (Ongoing)

### 7.1 Content Checklist for Each Chapter

**Every chapter must have:**

- [ ] At least 2 real-world scenarios with actual numbers
- [ ] Minimum 3 code examples (Terraform/Python/SQL/YAML)
- [ ] 2-4 diagrams (architecture or workflow)
- [ ] 1 "Field Note" callout (lessons learned)
- [ ] 1 interactive element (calculator or live code)
- [ ] Concrete metrics ($ savings, % improvement)
- [ ] Links to actual tools (with version numbers)

### 7.2 Writing Style Guide

**AVOID:**
- "You should consider..."
- "It's a good practice to..."
- Generic cloud platitudes

**USE INSTEAD:**
- "The McAfee team saved $140K/month by..."
- "Here's the Terraform module we use for..."
- "This pattern reduced our RDS costs by 63%"

### 7.3 Technical Depth Requirements

**Code Examples:**
- Must be copy-pasteable
- Include comments explaining non-obvious lines
- Show actual resource names (sanitized if needed)
- Include expected output

**Diagrams:**
- Show real service names (AWS RDS, not "database")
- Include cost annotations where relevant
- Use consistent icon set
- Label all connections

---

## Implementation Priorities

### Critical Path (DO FIRST):

1. **Week 1:** Custom Quarto theme + SCSS
2. **Week 2:** D2 diagram system + 5 core templates
3. **Week 3:** Rewrite 3 sample chapters with SOTA content
4. **Week 4:** Cover images + visual asset library
5. **Week 5:** Observable JS cost calculator
6. **Week 6:** Multi-book hub structure

### Nice-to-Have (LATER):

- WebR live code execution
- Custom LaTeX templates for PDF
- ePub optimization
- Automated screenshot generation
- Version control for diagrams

---

## Success Metrics

### Visual Quality Targets:
- **Designer review score:** 8/10+ (vs current 2/10)
- **Diagram coverage:** 1 diagram per 3 pages minimum
- **Code example density:** 1 per 2 pages minimum

### Content Quality Targets:
- **Specificity:** 80%+ of claims backed by actual numbers
- **Actionability:** Every optimization has implementation code
- **Premium feel:** "Would pay $200 for this" test

### Technical Targets:
- **Build time:** <2 minutes for full book
- **Mobile responsive:** Perfect on iPhone/iPad
- **Accessibility:** WCAG AA compliant
- **Search:** Full-text search across all books

---

## Next Steps

1. **Review this roadmap** with Talvinder
2. **Prioritize phases** based on upcoming ebook deadlines
3. **Assign ownership** (design vs content vs tooling)
4. **Set milestone dates** for each phase
5. **Define "done"** criteria for Phase 1

Would you like me to start implementing Phase 1 (Visual Foundation) immediately?
