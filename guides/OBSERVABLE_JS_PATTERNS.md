# Observable JS Patterns for Zopdev Ebooks

This guide shows you how to create interactive calculators and visualizations for ebooks using Observable JS (OJS) — a reactive JavaScript framework that works natively in Quarto documents.

## Table of Contents

1. [Quick Start](#quick-start)
2. [How OJS Works](#how-ojs-works)
3. [Using Calculator Templates](#using-calculator-templates)
4. [Observable Inputs](#observable-inputs)
5. [Reactive Programming](#reactive-programming)
6. [Styling with Zopdev Brand](#styling-with-zopdev-brand)
7. [Embedding Charts](#embedding-charts)
8. [PDF/EPUB Static Fallbacks](#pdfepub-static-fallbacks)
9. [Troubleshooting](#troubleshooting)
10. [Best Practices](#best-practices)

---

## Quick Start

1. **Copy a calculator template** from `_templates/ojs/` to your chapter
2. **Customize inputs and formulas** for your use case
3. **Style with Zopdev brand colors**
4. **Add static fallback** for PDF/EPUB
5. **Test** in HTML (interactive) and PDF (fallback)

Example:

````markdown
```{ojs}
//| echo: false

viewof investment = Inputs.range([10000, 500000], {
  value: 50000,
  step: 5000,
  label: "Implementation cost ($)"
})

viewof savings = Inputs.range([1000, 50000], {
  value: 15000,
  step: 1000,
  label: "Monthly savings ($)"
})

roi = ((savings * 12) / investment * 100).toFixed(0)

html`<div class="ojs-calculator">
  <p class="ojs-metric">
    <span class="ojs-metric-value">${roi}%</span>
    <span class="ojs-metric-label">Annual ROI</span>
  </p>
</div>`
```
````

---

## How OJS Works

### Reactive Cells

OJS uses **reactive programming**: when you change an input, all dependent calculations update automatically.

```ojs
// Input (user controls)
viewof hours = Inputs.range([0, 10000], { value: 2000 })

// Calculation (updates when hours changes)
cost = hours * 0.085

// Output (updates when cost changes)
html`<p>Total cost: $${cost.toFixed(2)}</p>`
```

**Key concept:** Every top-level assignment creates a **cell**. When a cell's dependencies change, the cell re-evaluates automatically.

### Execution Order

OJS doesn't run top-to-bottom like normal JavaScript. It builds a **dependency graph** and runs cells in the order needed.

```ojs
// This works even though 'b' is used before it's defined:
a = b + 10

viewof b = Inputs.range([0, 100], { value: 50 })

// Result: a = 60 (b=50 + 10)
```

### Cell Types

- **`viewof x`** — Creates an input control
- **`x = ...`** — Creates a computed value
- **`html`...`** — Renders HTML output
- **`md`...`** — Renders markdown output

---

## Using Calculator Templates

Zopdev provides 3 pre-built calculator templates optimized for FinOps/cloud ROI scenarios.

### Available Templates

| Template | Purpose | Use When |
|----------|---------|----------|
| **cost-comparison-calculator.qmd** | Compare 2+ options side-by-side | Evaluating cloud providers, instance types, commitment tiers |
| **roi-calculator.qmd** | Investment vs savings over time | Justifying FinOps tools, optimization projects |
| **resource-optimizer.qmd** | Find optimal resource tier based on usage | Right-sizing recommendations, tier selection |

### Copy a Template

**Method 1: Embed in Chapter**

Copy the OJS blocks from `_templates/ojs/<template>.qmd` into your chapter file.

**Method 2: Include Template** (if Quarto supports it)

```markdown
{{< include _templates/ojs/roi-calculator.qmd >}}
```

### Customize the Template

1. **Change input ranges and defaults**
   ```ojs
   viewof monthlyHours = Inputs.range([100, 10000], {
     value: 2000,  // <-- Change default
     step: 100,
     label: "Monthly compute hours"  // <-- Change label
   })
   ```

2. **Update cost formulas**
   ```ojs
   optionA = {
     const compute = monthlyHours * 0.085; // <-- Your rate
     const storage = storageGB * 0.023;
     return { name: "Option A", compute, storage, total: compute + storage };
   }
   ```

3. **Change output table columns/rows**
   ```ojs
   comparison = [optionA, optionB, optionC]

   html`<table class="ojs-results-table">
     <thead>
       <tr>
         <th>Metric</th>
         ${comparison.map(o => html`<th>${o.name}</th>`)}
       </tr>
     </thead>
     <tbody>
       <tr>
         <td>Monthly Cost</td>
         ${comparison.map(o => html`<td>${fmt(o.total)}</td>`)}
       </tr>
     </tbody>
   </table>`
   ```

---

## Observable Inputs

Observable provides pre-built input controls. Here are the most useful ones for FinOps calculators:

### Range Slider

```ojs
viewof hours = Inputs.range([0, 10000], {
  value: 2000,
  step: 100,
  label: "Monthly compute hours"
})

// Use: hours variable updates when slider moves
```

**Options:**
- `[min, max]` — Range bounds
- `value` — Initial value
- `step` — Increment size
- `label` — Display label

### Select Dropdown

```ojs
viewof region = Inputs.select(
  ["us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1"],
  {
    value: "us-east-1",
    label: "Region"
  }
)
```

### Radio Buttons

```ojs
viewof commitmentType = Inputs.radio(
  ["On-Demand", "1-Year Reserved", "3-Year Reserved"],
  {
    value: "1-Year Reserved",
    label: "Commitment type"
  }
)
```

### Checkbox

```ojs
viewof enableScheduling = Inputs.checkbox(
  ["Enable scheduling"],
  {
    value: ["Enable scheduling"],
    label: "Optimization features"
  }
)

// Use: enableScheduling.includes("Enable scheduling")
```

### Text Input

```ojs
viewof projectName = Inputs.text({
  label: "Project name",
  placeholder: "my-project",
  value: ""
})
```

### Number Input

```ojs
viewof instances = Inputs.number({
  label: "Number of instances",
  value: 10,
  min: 1,
  max: 1000,
  step: 1
})
```

### Date Input

```ojs
viewof startDate = Inputs.date({
  label: "Start date",
  value: "2024-01-01"
})
```

---

## Reactive Programming

### Pattern 1: Dependent Calculations

```ojs
// Inputs
viewof hours = Inputs.range([0, 10000], { value: 2000 })
viewof rate = Inputs.range([0.01, 0.50], { value: 0.085, step: 0.001 })

// Calculation (reacts to both inputs)
cost = hours * rate

// Output (reacts to cost)
html`<p>Monthly cost: <strong>$${cost.toFixed(2)}</strong></p>`
```

### Pattern 2: Conditional Logic

```ojs
viewof commitment = Inputs.select(["On-Demand", "Reserved"], { value: "On-Demand" })

discount = commitment === "Reserved" ? 0.35 : 0

effectiveRate = 0.085 * (1 - discount)

html`<p>Rate: $${effectiveRate.toFixed(3)}/hour (${(discount * 100)}% discount)</p>`
```

### Pattern 3: Aggregations

```ojs
viewof services = Inputs.checkbox(
  ["Compute", "Storage", "Transfer", "Support"],
  { value: ["Compute", "Storage"] }
)

costs = {
  Compute: 5000,
  Storage: 1200,
  Transfer: 800,
  Support: 2500
}

total = services.reduce((sum, s) => sum + costs[s], 0)

html`<p>Total: $${total.toLocaleString()}/month</p>`
```

### Pattern 4: Time Series Projections

```ojs
viewof months = Inputs.range([6, 60], { value: 36, step: 6 })

projections = {
  const rows = [];
  let cumSavings = 0;
  for (let m = 1; m <= months; m++) {
    cumSavings += 15000; // $15K/month
    rows.push({ month: m, cumSavings });
  }
  return rows;
}

// Use projections array in table or chart
```

---

## Styling with Zopdev Brand

### CSS Classes

The Zopdev theme provides pre-styled classes for calculator components:

**Calculator Container:**
```ojs
html`<div class="ojs-calculator">
  <!-- Your calculator content -->
</div>`
```

**Metric Cards:**
```ojs
html`<div class="ojs-metric">
  <span class="ojs-metric-value">$58,000</span>
  <span class="ojs-metric-label">Net benefit</span>
</div>`
```

**Metric Grid (2x2 or 3x1):**
```ojs
html`<div class="ojs-summary-grid">
  <div class="ojs-metric">...</div>
  <div class="ojs-metric">...</div>
  <div class="ojs-metric">...</div>
</div>`
```

**Results Table:**
```ojs
html`<table class="ojs-results-table">
  <thead>
    <tr>
      <th>Option</th>
      <th>Cost</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Option A</td>
      <td>$10,000</td>
    </tr>
  </tbody>
</table>`
```

**Positive/Negative Values:**
```ojs
html`<span class="ojs-positive">+$18,000</span>`
html`<span class="ojs-negative">-$5,000</span>`
```

**Recommendation Card:**
```ojs
html`<div class="ojs-recommendation">
  <span class="ojs-badge">Recommended</span>
  <strong>m5.xlarge</strong> — Best fit for your workload
</div>`
```

### Zopdev Brand Colors (in OJS)

```ojs
colors = {
  primary: "#0891b2",
  success: "#16a34a",
  warning: "#fbbf24",
  danger: "#ef4444",
  secondary: "#64748B",
  background: "#F8FAFC"
}

// Use in HTML:
html`<div style="background: ${colors.success}; color: white; padding: 1rem;">
  Savings: $18K/month
</div>`
```

---

## Embedding Charts

### Using Observable Plot

Observable Plot is a high-level charting library that integrates seamlessly with OJS.

**Line Chart (ROI Over Time):**

```ojs
Plot.plot({
  title: "Cumulative ROI Projection",
  width: 700,
  height: 350,
  y: { label: "Amount ($)", grid: true, tickFormat: "$,.0f" },
  x: { label: "Month" },
  color: { legend: true },
  marks: [
    Plot.line(projections, {
      x: "month",
      y: "cumSavings",
      stroke: "#16a34a",
      strokeWidth: 2,
      tip: true
    }),
    Plot.line(projections, {
      x: "month",
      y: "cumInvestment",
      stroke: "#ef4444",
      strokeWidth: 2,
      tip: true
    }),
    Plot.ruleY([0], { stroke: "#94A3B8", strokeDasharray: "4,4" })
  ]
})
```

**Bar Chart (Cost Breakdown):**

```ojs
costData = [
  { category: "Compute", cost: 5000 },
  { category: "Storage", cost: 1200 },
  { category: "Transfer", cost: 800 }
]

Plot.plot({
  width: 600,
  height: 300,
  y: { label: "Cost ($)", grid: true },
  marks: [
    Plot.barY(costData, {
      x: "category",
      y: "cost",
      fill: "#0891b2",
      tip: true
    })
  ]
})
```

**Dot Chart (Comparison):**

```ojs
Plot.plot({
  width: 600,
  height: 300,
  x: { label: "Monthly Cost ($)" },
  marks: [
    Plot.dot(comparison, {
      x: "total",
      y: "name",
      fill: "#0891b2",
      r: 8
    })
  ]
})
```

### Using D3

For more control, use D3 directly:

```ojs
d3 = require("d3@7")

fmt = d3.format("$,.0f")
pct = d3.format(".1%")

// Use: fmt(1234567) => "$1,234,567"
// Use: pct(0.35) => "35.0%"
```

---

## PDF/EPUB Static Fallbacks

**Problem:** Interactive OJS calculators only work in HTML. PDF and EPUB formats can't run JavaScript.

**Solution:** Use Quarto's conditional content blocks to show static tables in PDF/EPUB while showing interactive calculators in HTML.

### Pattern: Static Fallback Table

````markdown
```{ojs}
//| echo: false
// Interactive calculator (HTML only)
viewof hours = Inputs.range([100, 10000], { value: 2000 })
cost = hours * 0.085

html`<p>Cost: $${cost.toFixed(2)}</p>`
```

::: {.content-visible when-format="pdf"}
**Cost Calculator (Default Scenario)**

Based on 2,000 compute hours at $0.085/hour:

| Compute Hours | Monthly Cost |
|---------------|--------------|
| 2,000         | $170.00      |

*Adjust values in the interactive HTML version.*
:::

::: {.content-visible when-format="epub"}
**Cost Calculator (Default Scenario)**

Based on 2,000 compute hours at $0.085/hour:

| Compute Hours | Monthly Cost |
|---------------|--------------|
| 2,000         | $170.00      |

*Adjust values in the interactive HTML version.*
:::
````

### Pattern: Static Comparison Table

````markdown
```{ojs}
//| echo: false
// Interactive comparison (HTML only)
comparison = [
  { name: "On-Demand", cost: 199 },
  { name: "1-Year Reserved", cost: 133 },
  { name: "3-Year Reserved", cost: 95 }
]

html`<table class="ojs-results-table">
  <!-- Table rows -->
</table>`
```

::: {.content-visible when-format="pdf"}
**Cost Comparison (Default Scenario)**

| Option          | Monthly Cost | Annual Cost |
|-----------------|--------------|-------------|
| On-Demand       | $199         | $2,388      |
| 1-Year Reserved | $133         | $1,596      |
| 3-Year Reserved | $95          | $1,140      |
:::
````

### Best Practices for Fallbacks

1. **Always provide fallbacks** for any OJS calculator
2. **Show default scenario** — Use the template's default input values
3. **Include note** — Remind readers that HTML version is interactive
4. **Match styling** — Use Quarto tables, not hand-formatted markdown

---

## Troubleshooting

### Problem: "viewof is not defined"

**Cause:** Trying to use Observable Inputs in a regular JavaScript code block.

**Solution:** Use `{ojs}` code fence, not `{js}`:

````markdown
```{ojs}  <!-- Not {js} -->
viewof x = Inputs.range([0, 100])
```
````

### Problem: Calculator doesn't update

**Cause:** Not using `viewof` for input controls.

**Solution:**
```ojs
// ❌ Wrong:
x = Inputs.range([0, 100])

// ✅ Right:
viewof x = Inputs.range([0, 100])
```

### Problem: "Cannot read property of undefined"

**Cause:** Accessing a cell before it's defined in the dependency graph.

**Solution:** OJS resolves dependencies automatically, but you can't reference cells from other code blocks or use them in non-reactive contexts.

```ojs
// ❌ This won't work (different code blocks):
```{ojs}
viewof x = Inputs.range([0, 100])
```

```{js}
console.log(x); // ERROR: x is not defined in JS scope
```

// ✅ Use in same OJS block:
```{ojs}
viewof x = Inputs.range([0, 100])
console.log(x); // Works
```
````

### Problem: Styling doesn't apply

**Cause:** CSS classes not loaded or misspelled.

**Solution:**
1. Verify `_themes/zopdev-book.scss` includes OJS styles
2. Check class names: `ojs-calculator`, `ojs-metric`, `ojs-results-table`
3. Test in rendered HTML: `make render ebook=<slug>`

### Problem: PDF shows blank instead of fallback

**Cause:** Missing `content-visible` blocks.

**Solution:** Always add PDF/EPUB fallbacks:

````markdown
::: {.content-visible when-format="pdf"}
**Static table here**
:::
````

---

## Best Practices

### 1. Use Templates as Starting Points

Don't write OJS from scratch. Copy `_templates/ojs/*.qmd` and customize.

### 2. Keep Calculators Simple

- **3-6 inputs maximum** — More is overwhelming
- **One concept per calculator** — Don't combine unrelated things
- **Real-world defaults** — Use typical values, not 0 or 100

### 3. Provide Context

Every calculator needs:
- **Introductory paragraph** — What does this calculator do?
- **Callout box** — How to use it
- **Interpretation** — What do the results mean?

Example:

```markdown
## ROI Calculator

This calculator helps you estimate the return on investment for a FinOps
optimization project. Adjust the inputs below to match your scenario.

::: {.callout-note}
## How to Use
Enter your implementation costs, expected monthly savings, and time horizon.
The calculator will show your break-even point and ROI over time.
:::

```{ojs}
<!-- Calculator here -->
```

**Interpretation:** A break-even point under 6 months is considered excellent
for FinOps projects. If your ROI exceeds 200% in the first year, prioritize
this optimization immediately.
```

### 4. Format Numbers Consistently

Use D3 formatters:

```ojs
d3 = require("d3@7")

fmt = d3.format("$,.0f")    // $1,234,567
fmtDec = d3.format("$,.2f") // $1,234.56
pct = d3.format(".0%")      // 35%
pctDec = d3.format(".1%")   // 35.4%
```

### 5. Test All Formats

Always verify:
- **HTML:** Calculator is interactive, sliders work, output updates
- **PDF:** Fallback table displays correctly
- **EPUB:** Fallback table displays correctly

```bash
make render ebook=<slug>
open books/<slug>/_output/html/index.html
open books/<slug>/_output/<slug>.pdf
```

### 6. Validate OJS Syntax

```bash
# Validate all OJS blocks in an ebook
make validate

# Or run OJS utilities directly:
bun run scripts/ojs-utils.ts --validate books/<slug>/chapters/*.qmd
```

### 7. Don't Over-Engineer

**❌ Avoid:**
- Complex state management
- External API calls
- Heavy computations (>1 second)
- DOM manipulation with jQuery

**✅ Prefer:**
- Simple reactive calculations
- Static data (pre-computed)
- Fast operations (<100ms)
- Observable's html template literals

### 8. Mobile-Friendly Design

- Use responsive CSS classes (`.ojs-summary-grid` auto-wraps)
- Test on narrow viewports (400px)
- Avoid fixed widths for tables
- Use horizontal scroll for wide tables

---

## Common Patterns

### Pattern: Savings Calculator

```ojs
viewof currentCost = Inputs.range([1000, 100000], {
  value: 45000,
  step: 1000,
  label: "Current monthly cost ($)"
})

viewof optimizationPercent = Inputs.range([10, 50], {
  value: 30,
  step: 5,
  label: "Expected savings (%)"
})

monthlySavings = currentCost * (optimizationPercent / 100)
annualSavings = monthlySavings * 12

html`<div class="ojs-summary-grid">
  <div class="ojs-metric">
    <span class="ojs-metric-value">$${d3.format(",.0f")(monthlySavings)}</span>
    <span class="ojs-metric-label">Monthly savings</span>
  </div>
  <div class="ojs-metric">
    <span class="ojs-metric-value">$${d3.format(",.0f")(annualSavings)}</span>
    <span class="ojs-metric-label">Annual savings</span>
  </div>
</div>`
```

### Pattern: Right-Sizing Recommender

```ojs
viewof cpu = Inputs.range([0, 100], { value: 45, label: "CPU utilization (%)" })
viewof memory = Inputs.range([0, 100], { value: 60, label: "Memory utilization (%)" })

recommendation = {
  if (cpu < 30 && memory < 30) return "Downsize 2 tiers";
  if (cpu < 50 && memory < 50) return "Downsize 1 tier";
  if (cpu > 80 || memory > 80) return "Upsize 1 tier";
  return "Current size is optimal";
}

html`<div class="ojs-recommendation">
  <strong>${recommendation}</strong>
</div>`
```

---

## Additional Resources

- **Observable Documentation**: https://observablehq.com/@observablehq/documentation
- **Observable Plot**: https://observablehq.com/plot/
- **Observable Inputs**: https://observablehq.com/@observablehq/inputs
- **Quarto OJS Guide**: https://quarto.org/docs/interactive/ojs/
- **Zopdev OJS Templates**: `_templates/ojs/` (3 reusable templates)

---

## Examples in This Ebook

See these chapters for working OJS examples:
- Chapter 5: Optimization Strategies (ROI calculator)
- Chapter 4: Cost Allocation (cost comparison)
- Chapter 3: Right-Sizing (resource optimizer)

**Questions?** Check `scripts/ojs-utils.ts` for utility functions, or ask in #ebook-engine Slack.
