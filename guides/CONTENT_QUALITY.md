# Content Quality Guide for Zopdev Ebooks

This guide defines **State-of-the-Art (SOTA) content quality** for Zopdev ebooks and shows you how to create professional, high-value technical documentation that readers would pay $200+ for.

## Table of Contents

1. [What is SOTA Content?](#what-is-sota-content)
2. [SOTA Content Principles](#sota-content-principles)
3. [Incident-Driven Narrative](#incident-driven-narrative)
4. [Code Example Standards](#code-example-standards)
5. [Numerical Specificity](#numerical-specificity)
6. [Interactive Elements](#interactive-elements)
7. [Visual Density](#visual-density)
8. [Before/After Transformations](#beforeafter-transformations)
9. [Quality Metrics](#quality-metrics)
10. [Content Audit Tool](#content-audit-tool)
11. [Anti-Patterns](#anti-patterns)

---

## What is SOTA Content?

**State-of-the-Art (SOTA) content** is professional technical documentation that:

1. **Solves real problems** with production-ready solutions
2. **Uses specific numbers** from actual scenarios
3. **Shows, don't tells** with diagrams and code
4. **Enables action** with copy-pasteable examples
5. **Proves ROI** with quantified outcomes

### SOTA vs. Generic Content

| Generic Content | SOTA Content |
|-----------------|--------------|
| "Many organizations struggle with cloud costs" | "When Acme Corp's AWS bill hit $450K/month, the CTO escalated to the board" |
| "Consider using reserved instances" | "Switching 500 m5.2xlarge instances from on-demand to 1-year RIs saved $180K/month (40% reduction)" |
| "Right-sizing can save 30-50%" | "Our right-sizing campaign identified 143 overprovisioned instances, saving $22K/month" |
| "Use tagging for cost allocation" | "We implemented a 6-tag taxonomy (team/env/app/owner/cost-center/project) and achieved 85% tag coverage in 3 months" |

---

## SOTA Content Principles

### Principle 1: Incident-Driven Narratives

**Every chapter starts with a real incident, not an abstract concept.**

**❌ Generic Opening:**
> Cloud costs can grow unexpectedly, so it's important to monitor your spending regularly.

**✅ SOTA Opening:**
> On Monday morning, the DevOps team woke up to a $47,000 AWS bill — triple the usual amount. A misconfigured auto-scaling group had spun up 500 c5.9xlarge instances over the weekend, idling at 3% CPU utilization. This incident became the catalyst for implementing ZopNight's automated resource scheduling, which now saves $18K/month.

**Formula:**
1. **Specific incident** — What happened? When? Who was affected?
2. **Quantified impact** — How much did it cost? What was the damage?
3. **Resolution** — How was it solved? What was implemented?
4. **Outcome** — What savings or improvement resulted?

### Principle 2: Production-Ready Code

**Code examples must be copy-pasteable and actually work.**

**❌ Pseudocode:**
```python
# Get cost data
costs = get_costs()

# Analyze
analyze(costs)
```

**✅ Production-Ready:**
```python
import boto3
from datetime import datetime, timedelta

def get_untagged_resources(region='us-east-1'):
    """
    Find EC2 instances without required tags.
    Returns list of instance IDs with current hourly cost.
    """
    ec2 = boto3.client('ec2', region_name=region)
    ce = boto3.client('ce')

    # Get all running instances
    instances = ec2.describe_instances(
        Filters=[{'Name': 'instance-state-name', 'Values': ['running']}]
    )

    untagged = []
    required_tags = ['Environment', 'Team', 'CostCenter']

    for reservation in instances['Reservations']:
        for instance in reservation['Instances']:
            tags = {t['Key']: t['Value'] for t in instance.get('Tags', [])}
            missing_tags = [t for t in required_tags if t not in tags]

            if missing_tags:
                # Get hourly cost from Cost Explorer
                cost_response = ce.get_cost_and_usage(
                    TimePeriod={
                        'Start': (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d'),
                        'End': datetime.now().strftime('%Y-%m-%d')
                    },
                    Granularity='DAILY',
                    Filter={
                        'Dimensions': {
                            'Key': 'RESOURCE_ID',
                            'Values': [instance['InstanceId']]
                        }
                    },
                    Metrics=['UnblendedCost']
                )

                weekly_cost = sum(
                    float(day['Total']['UnblendedCost']['Amount'])
                    for day in cost_response['ResultsByTime']
                )
                hourly_cost = weekly_cost / (7 * 24)

                untagged.append({
                    'instance_id': instance['InstanceId'],
                    'type': instance['InstanceType'],
                    'missing_tags': missing_tags,
                    'hourly_cost': round(hourly_cost, 3)
                })

    return untagged

if __name__ == '__main__':
    results = get_untagged_resources()
    total_waste = sum(r['hourly_cost'] for r in results) * 730  # Hours/month

    print(f"Found {len(results)} untagged instances")
    print(f"Potential waste: ${total_waste:,.2f}/month")

    for r in results[:10]:  # Top 10
        print(f"  {r['instance_id']} ({r['type']}): "
              f"${r['hourly_cost']:.3f}/hr, missing {r['missing_tags']}")
```

**Requirements:**
- Real imports, not placeholders
- Error handling where needed
- Docstrings explaining purpose
- Runnable as-is (or with minimal setup)
- Comments for non-obvious logic

### Principle 3: Numerical Specificity

**Use exact numbers from real scenarios, not vague ranges.**

**❌ Vague:**
- "Significant savings"
- "30-50% reduction"
- "Many instances"
- "Considerable improvement"

**✅ Specific:**
- "$18,242/month savings (38.4% reduction)"
- "143 overprovisioned instances"
- "500-node Kubernetes cluster"
- "Reduced p99 latency from 847ms to 203ms"

**Where to use numbers:**
- Dollar amounts: Always include $/month or $/year
- Fleet sizes: Exact instance/server/pod counts
- Percentages: Use decimals (38.4%, not 30-50%)
- Time periods: Specific durations (3 months, 14 days)
- Performance metrics: Exact measurements (99.97% uptime)

### Principle 4: Visual Density

**Aim for 0.3+ diagrams per 1000 words.**

**Why diagrams matter:**
- Complex architectures are easier to understand visually
- Before/after comparisons show impact immediately
- Cost annotations make abstract savings concrete

**When to add a diagram:**
- Cloud architecture (always)
- Workflow/process (always)
- Before/after optimization (always)
- Multi-step procedures (if >3 steps)
- Cost breakdown (if >3 components)

**Diagram types:**
- D2: Cloud architectures, infrastructure layouts
- Mermaid: Flowcharts, sequence diagrams
- Tables: Cost comparisons, metric breakdowns

### Principle 5: Interactive Elements

**Add calculators for scenarios readers want to model.**

**When to add a calculator:**
- ROI estimation — "How much will this save me?"
- Cost comparison — "Which option is cheaper for my usage?"
- Right-sizing — "What instance type should I use?"
- Commitment optimization — "Should I buy RIs or use on-demand?"

**Example use cases:**
- Chapter on right-sizing → Add instance size calculator
- Chapter on commitments → Add RI vs. Savings Plan calculator
- Chapter on storage tiering → Add S3 class cost comparison

---

## Incident-Driven Narrative

### Structure

Every chapter should follow this structure:

1. **Opening Incident** (1-2 paragraphs)
   - Specific scenario with real numbers
   - Quantified problem or pain point
   - Sets up the "why" for the chapter

2. **Background Context** (2-3 paragraphs)
   - Why this problem is common
   - Root causes
   - Industry context

3. **Solution Deep Dive** (main content)
   - Step-by-step implementation
   - Production-ready code examples
   - Architecture diagrams
   - Best practices

4. **Results & Outcomes** (1-2 paragraphs)
   - Quantified improvements
   - Lessons learned
   - Call-to-action

### Example Template

```markdown
# Chapter: Right-Sizing EC2 Instances

## The $22K Wake-Up Call

When Sarah, the FinOps lead at Acme Corp, ran her first right-sizing audit,
she was shocked: **143 EC2 instances were overprovisioned**, running at an
average of 18% CPU utilization. The m5.2xlarge instances that engineering
had provisioned "to be safe" were costing the company **$22,300/month** in
unnecessary spend.

The problem wasn't visible in CloudWatch alone — it required analyzing
CPU, memory, network, and disk I/O together. And even when she identified
the overprovisioned instances, getting engineering buy-in to downsize was
a political minefield.

## Why Over-Provisioning Happens

[Background context...]

## The Right-Sizing Framework

[Solution deep dive with code, diagrams, calculators...]

## Results After 3 Months

After implementing automated right-sizing recommendations with ZopNight,
Acme Corp achieved:

- **$18,400/month in sustained savings** (83% of identified waste eliminated)
- **Zero performance incidents** from downsizing
- **14 minutes average time** to review and approve recommendations
- **92% engineering team satisfaction** with the process

The key lesson: right-sizing is a continuous process, not a one-time audit.
```

---

## Code Example Standards

### Requirements Checklist

Every code example must:

- ✅ Use real libraries/frameworks (not pseudocode)
- ✅ Include imports/requirements
- ✅ Have docstrings/comments
- ✅ Handle errors appropriately
- ✅ Be runnable (or nearly runnable)
- ✅ Include sample output
- ✅ Have language tag in code fence

### Pattern: Terraform Module

````markdown
```terraform
# Right-sizing policy using Open Policy Agent (OPA)
# Blocks creation of overprovisioned instances based on historical metrics

terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

# Fetch instance type recommendations from AWS Compute Optimizer
data "aws_computeoptimizer_recommendation" "ec2" {
  for_each = toset(var.instance_ids)

  recommendation_type = "Ec2Instance"
  resource_arn       = "arn:aws:ec2:${var.region}:${data.aws_caller_identity.current.account_id}:instance/${each.value}"
}

# Policy: Block launch if Compute Optimizer recommends downsizing
resource "aws_iam_policy" "right_sizing_enforcement" {
  name        = "RightSizingEnforcementPolicy"
  description = "Blocks overprovisioned EC2 instance launches"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Deny"
        Action = [
          "ec2:RunInstances"
        ]
        Resource = "arn:aws:ec2:*:*:instance/*"
        Condition = {
          StringEquals = {
            "ec2:InstanceType" = [
              for rec in data.aws_computeoptimizer_recommendation.ec2 :
              rec.current_instance_type
              if rec.finding == "OVER_PROVISIONED"
            ]
          }
        }
      }
    ]
  })
}

output "overprovisioned_instances" {
  description = "List of instances recommended for downsizing"
  value = [
    for id, rec in data.aws_computeoptimizer_recommendation.ec2 :
    {
      instance_id          = id
      current_type         = rec.current_instance_type
      recommended_type     = rec.recommended_instance_types[0]
      estimated_savings    = rec.projected_utilization_metrics[0].savings_opportunity.estimated_monthly_savings
      utilization_avg      = rec.current_performance_risk
    }
    if rec.finding == "OVER_PROVISIONED"
  ]
}
```

**Usage:**

```bash
terraform init
terraform plan -var-file=prod.tfvars
terraform apply

# Sample output:
# overprovisioned_instances = [
#   {
#     instance_id = "i-0abc123def456"
#     current_type = "m5.2xlarge"
#     recommended_type = "m5.xlarge"
#     estimated_savings = "$243.20"
#     utilization_avg = "18.4%"
#   },
#   ...
# ]
```
````

### Pattern: Python Script

````markdown
```python
#!/usr/bin/env python3
"""
Automate RI/SP purchase recommendations based on usage patterns.

This script analyzes the last 30 days of EC2 usage and recommends
optimal Reserved Instance or Savings Plan purchases to maximize savings.

Requirements:
    pip install boto3 pandas numpy
"""

import boto3
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List

def get_ec2_usage(start_date: datetime, end_date: datetime, region: str = 'us-east-1') -> pd.DataFrame:
    """
    Fetch EC2 usage data from Cost Explorer.

    Returns DataFrame with columns: date, instance_type, hours, cost
    """
    ce = boto3.client('ce', region_name=region)

    response = ce.get_cost_and_usage(
        TimePeriod={
            'Start': start_date.strftime('%Y-%m-%d'),
            'End': end_date.strftime('%Y-%m-%d')
        },
        Granularity='DAILY',
        Filter={
            'Dimensions': {
                'Key': 'SERVICE',
                'Values': ['Amazon Elastic Compute Cloud - Compute']
            }
        },
        Metrics=['UsageQuantity', 'UnblendedCost'],
        GroupBy=[
            {'Type': 'DIMENSION', 'Key': 'INSTANCE_TYPE'},
            {'Type': 'DIMENSION', 'Key': 'PURCHASE_TYPE'}
        ]
    )

    records = []
    for day in response['ResultsByTime']:
        date = datetime.strptime(day['TimePeriod']['Start'], '%Y-%m-%d')
        for group in day['Groups']:
            instance_type = group['Keys'][0]
            purchase_type = group['Keys'][1]

            if purchase_type == 'On Demand':
                records.append({
                    'date': date,
                    'instance_type': instance_type,
                    'hours': float(group['Metrics']['UsageQuantity']['Amount']),
                    'cost': float(group['Metrics']['UnblendedCost']['Amount'])
                })

    return pd.DataFrame(records)

def recommend_ri_purchases(usage_df: pd.DataFrame, threshold_hours: int = 500) -> List[Dict]:
    """
    Recommend RI purchases for instance types with consistent usage.

    Args:
        usage_df: DataFrame from get_ec2_usage()
        threshold_hours: Minimum monthly hours to recommend RI

    Returns:
        List of recommendations with estimated savings
    """
    monthly = usage_df.groupby('instance_type').agg({
        'hours': 'sum',
        'cost': 'sum'
    }).reset_index()

    ri_discount = 0.35  # 35% typical 1-year RI discount
    recommendations = []

    for _, row in monthly.iterrows():
        if row['hours'] >= threshold_hours:
            instance_count = int(row['hours'] / 730)  # Hours per month
            monthly_ri_cost = row['cost'] * (1 - ri_discount)
            monthly_savings = row['cost'] - monthly_ri_cost

            recommendations.append({
                'instance_type': row['instance_type'],
                'instance_count': instance_count,
                'monthly_on_demand_cost': round(row['cost'], 2),
                'monthly_ri_cost': round(monthly_ri_cost, 2),
                'monthly_savings': round(monthly_savings, 2),
                'annual_savings': round(monthly_savings * 12, 2),
                'recommendation': f"Purchase {instance_count}x 1-year RI"
            })

    return sorted(recommendations, key=lambda x: x['annual_savings'], reverse=True)

if __name__ == '__main__':
    # Analyze last 30 days
    end_date = datetime.now()
    start_date = end_date - timedelta(days=30)

    print(f"Analyzing EC2 usage from {start_date.date()} to {end_date.date()}...\n")

    usage = get_ec2_usage(start_date, end_date)
    recs = recommend_ri_purchases(usage)

    total_savings = sum(r['annual_savings'] for r in recs)

    print(f"Top RI Purchase Recommendations:\n")
    print(f"{'Instance Type':<20} {'Count':<8} {'Monthly Savings':<20} {'Annual Savings':<20}")
    print("-" * 70)

    for rec in recs[:10]:
        print(f"{rec['instance_type']:<20} {rec['instance_count']:<8} "
              f"${rec['monthly_savings']:<19,.2f} ${rec['annual_savings']:<19,.2f}")

    print(f"\nTotal potential savings: ${total_savings:,.2f}/year")
```

**Sample output:**

```
Analyzing EC2 usage from 2024-01-01 to 2024-01-31...

Top RI Purchase Recommendations:

Instance Type        Count    Monthly Savings      Annual Savings
----------------------------------------------------------------------
m5.2xlarge           12       $3,240.00            $38,880.00
c5.xlarge            8        $1,890.00            $22,680.00
r5.large             6        $980.00              $11,760.00
...

Total potential savings: $73,320.00/year
```
````

---

## Numerical Specificity

### Checklist: Every Chapter Should Include

- ✅ At least 1 dollar amount ($X/month or $X/year)
- ✅ At least 1 specific percentage (38.4%, not "30-50%")
- ✅ At least 1 fleet size (500 instances, 10TB storage)
- ✅ At least 1 time measurement (3 months, 14 days)
- ✅ At least 1 performance metric (p99 latency, 99.97% uptime)

### Pattern: Quantified Outcomes

**❌ Vague:**
> After implementing tagging policies, we improved cost allocation significantly.

**✅ Specific:**
> After implementing our 6-tag taxonomy (team/env/app/owner/cost-center/project),
> we achieved 85% tag coverage across 2,400 resources in 3 months. This enabled us
> to allocate $380K/month (84% of total spend) to specific teams, up from just
> $120K/month (27%) before.

---

## Interactive Elements

### When to Add Calculators

Add an OJS calculator when readers need to:

1. **Estimate ROI** for a recommendation
2. **Compare options** (on-demand vs. reserved, AWS vs. GCP)
3. **Find optimal settings** (instance size, tier, commitment level)
4. **Model scenarios** (scaling, growth, optimization)

### Example: Right-Sizing Calculator

```ojs
viewof currentType = Inputs.select(
  ["m5.2xlarge", "m5.xlarge", "m5.large"],
  { value: "m5.2xlarge", label: "Current instance type" }
)

viewof cpuUtilization = Inputs.range([0, 100], {
  value: 18,
  step: 1,
  label: "Average CPU utilization (%)"
})

recommendation = {
  if (cpuUtilization < 20) return "m5.large";
  if (cpuUtilization < 50) return "m5.xlarge";
  return currentType;
}

monthlySavings = {
  const costs = {
    "m5.2xlarge": 280,
    "m5.xlarge": 140,
    "m5.large": 70
  };
  return costs[currentType] - costs[recommendation];
}

html`<div class="ojs-recommendation">
  <strong>Recommendation:</strong> ${recommendation}<br>
  <strong>Monthly savings:</strong> $${monthlySavings * 730}/instance
</div>`
```

---

## Visual Density

### Target: 0.3 Diagrams per 1000 Words

**Why this matters:**
- Technical readers process visuals faster than text
- Complex concepts (architectures, workflows) need diagrams
- Before/after comparisons are more impactful visually

### When to Add Diagrams

**Always diagram:**
- Cloud architecture (VPC, services, connections)
- Before/after optimization
- Workflow/process (FinOps lifecycle, approval flow)
- Multi-step procedures (>3 steps)

**Consider diagramming:**
- Cost breakdown (if >3 components)
- Comparison (AWS vs. GCP vs. Azure)
- Hierarchy (org structure, IAM policies)

### Example Chapter Outline

For a 3,000-word chapter, aim for **1+ diagrams**:

- Opening: Text-only incident
- Section 1: Background + workflow diagram
- Section 2: Solution + architecture diagram
- Section 3: Implementation + code example
- Section 4: Results + before/after diagram + table

---

## Before/After Transformations

### Example Transformation

**Before (Generic):**

> ## Right-Sizing EC2 Instances
>
> Right-sizing means selecting the optimal instance type for your workload. Many organizations overprovision resources "to be safe," which leads to unnecessary costs.
>
> To right-size, you should monitor CPU and memory utilization over time. If utilization is consistently low (under 50%), consider downsizing.
>
> Reserved Instances can provide significant savings, typically 30-50% compared to on-demand pricing.

**Issues:**
- No specific incident
- Vague language ("many organizations", "typically 30-50%")
- No code examples
- No diagrams
- No real numbers

**After (SOTA):**

> ## Right-Sizing EC2 Instances
>
> ### The $22K Wake-Up Call
>
> When Sarah, the FinOps lead at Acme Corp, ran her first right-sizing audit, she was shocked: **143 EC2 instances were overprovisioned**, running at an average of 18% CPU utilization. The m5.2xlarge instances that engineering had provisioned "to be safe" were costing the company **$22,300/month** in unnecessary spend.
>
> [Diagram: Before/after architecture with cost annotations]
>
> The problem wasn't visible in CloudWatch alone — it required analyzing CPU, memory, network, and disk I/O together. And even when she identified the overprovisioned instances, getting engineering buy-in to downsize was a political minefield.
>
> ### The Right-Sizing Framework
>
> Here's the automated analysis script we used to identify overprovisioned instances:
>
> ```python
> #!/usr/bin/env python3
> """
> Analyze EC2 instance utilization and recommend right-sizing.
> """
> import boto3
> from datetime import datetime, timedelta
>
> def analyze_instance(instance_id, region='us-east-1'):
>     cw = boto3.client('cloudwatch', region_name=region)
>     ec2 = boto3.client('ec2', region_name=region)
>
>     # Get instance details
>     instance = ec2.describe_instances(InstanceIds=[instance_id])['Reservations'][0]['Instances'][0]
>     instance_type = instance['InstanceType']
>
>     # Get 30-day metrics
>     end_time = datetime.now()
>     start_time = end_time - timedelta(days=30)
>
>     metrics = {}
>     for metric in ['CPUUtilization', 'NetworkIn', 'NetworkOut']:
>         response = cw.get_metric_statistics(
>             Namespace='AWS/EC2',
>             MetricName=metric,
>             Dimensions=[{'Name': 'InstanceId', 'Value': instance_id}],
>             StartTime=start_time,
>             EndTime=end_time,
>             Period=3600,
>             Statistics=['Average', 'Maximum']
>         )
>         metrics[metric] = {
>             'avg': sum(d['Average'] for d in response['Datapoints']) / len(response['Datapoints']),
>             'max': max(d['Maximum'] for d in response['Datapoints'])
>         }
>
>     # Recommendation logic
>     if metrics['CPUUtilization']['avg'] < 20:
>         recommendation = "Downsize 2 tiers"
>         potential_savings = 140  # $/month for m5.2xlarge → m5.large
>     elif metrics['CPUUtilization']['avg'] < 40:
>         recommendation = "Downsize 1 tier"
>         potential_savings = 70
>     else:
>         recommendation = "Current size is optimal"
>         potential_savings = 0
>
>     return {
>         'instance_id': instance_id,
>         'instance_type': instance_type,
>         'cpu_avg': round(metrics['CPUUtilization']['avg'], 1),
>         'cpu_max': round(metrics['CPUUtilization']['max'], 1),
>         'recommendation': recommendation,
>         'savings': potential_savings
>     }
> ```
>
> [Interactive calculator: Right-sizing ROI based on CPU utilization]
>
> ### Results After 3 Months
>
> After implementing automated right-sizing recommendations with ZopNight, Acme Corp achieved:
>
> - **$18,400/month in sustained savings** (83% of identified waste eliminated)
> - **Zero performance incidents** from downsizing
> - **14 minutes average time** to review and approve recommendations
> - **92% engineering team satisfaction** with the process

**Improvements:**
- ✅ Opens with specific incident ($22K, 143 instances, 18% CPU)
- ✅ Includes production-ready Python script
- ✅ Adds before/after diagram with cost annotations
- ✅ Includes interactive calculator
- ✅ Quantifies outcomes ($18,400/month, 0 incidents, 92% satisfaction)

---

## Quality Metrics

The ebook engine automatically measures 6 quality metrics:

### 1. Diagram Density

**Target:** ≥0.3 diagrams per 1000 words

**Measured by:** D2 blocks, Mermaid blocks, images

**How to improve:**
- Add architecture diagrams to technical sections
- Use before/after comparison diagrams
- Add workflow/process visualizations

### 2. Code Density

**Target:** ≥2 code blocks per chapter

**Measured by:** Fenced code blocks (```language)

**How to improve:**
- Add production-ready scripts
- Include configuration examples (Terraform, YAML)
- Show command-line usage

### 3. Generic Claims

**Target:** ≤5 vague claims per chapter

**Flags:**
- "should consider", "many organizations", "typically"
- "significant(ly)", "various", "often"
- Vague percentage ranges ("30-50%")

**How to improve:**
- Replace with specific numbers
- Cite real examples
- Use incident-driven narratives

### 4. Interactive Elements

**Target:** ≥1 OJS calculator per ebook

**Measured by:** OJS code blocks

**How to improve:**
- Add ROI calculators
- Include cost comparison tools
- Provide scenario modeling

### 5. Real Numbers

**Target:** ≥1 real number per chapter

**Measured by:**
- Dollar amounts ($180K/month)
- Specific percentages (38.4%)
- Fleet sizes (500 instances)

**How to improve:**
- Use actual numbers from case studies
- Include benchmark data
- Quantify all outcomes

### 6. Reading Level

**Target:** Grade level 8-14

**Measured by:** Flesch-Kincaid Grade Level

**How to improve:**
- Break up long sentences
- Avoid jargon (or explain it)
- Use active voice

---

## Content Audit Tool

### Run Audit

```bash
# Audit a specific ebook
make audit ebook=finops-playbook

# Audit all ebooks
make audit-all
```

### Interpret Results

```
─────────────────────────────────────────────────────────────────────
  CONTENT QUALITY AUDIT: finops-playbook
  2024-12-14T10:30:00.000Z
─────────────────────────────────────────────────────────────────────

  Overall Score: C  (7 violations)
  Chapters: 8

  DIAGRAMS
  Total: 2 diagrams in 18,342 words
  Density: 0.11 per 1000 words
    01-introduction: 0 diagrams (0.00/1000w) [!]
    02-visibility: 1 diagrams (0.42/1000w)
    ...

  CODE BLOCKS
  Total: 12 blocks
  Languages: python(5), terraform(3), bash(2), yaml(2)
    01-introduction: 0 blocks [!]
    02-visibility: 2 blocks
    ...

  GENERIC CLAIMS
  Total: 47
    01-introduction: 8 claims [!]
    02-visibility: 5 claims
    ...

  THRESHOLD VIOLATIONS (7)
    WARN: Overall diagram density (0.11/1000 words) is below minimum (0.3/1000 words)
    WARN: Chapter "01-introduction" has 0 code blocks (minimum: 2)
    WARN: Chapter "01-introduction" has 8 generic claims (maximum: 5)
    ...
```

**Action items:**
1. Add diagrams to chapters with 0.00 density
2. Add code examples to chapters with <2 blocks
3. Replace generic claims with specific numbers
4. Add interactive calculators (currently 0)

---

## Anti-Patterns

### Anti-Pattern 1: Starting with Definitions

**❌ Bad:**
> # Chapter 1: Introduction to FinOps
>
> FinOps is a cultural practice that brings financial accountability to the variable spend model of cloud computing. It enables teams to make informed trade-offs between speed, cost, and quality.

**✅ Good:**
> # Chapter 1: The $450K Cloud Bill That Shocked the Board
>
> When Acme Corp's CTO presented the quarterly board report, one slide made the CFO choke on her coffee: AWS spending had hit **$450K/month** — a 300% increase year-over-year. "How did we get here?" the CEO demanded. "And more importantly, how do we fix it?"
>
> This incident kicked off Acme's FinOps transformation...

### Anti-Pattern 2: Pseudocode Examples

**❌ Bad:**
```python
# Get resources
resources = get_resources()

# Filter untagged
untagged = filter(resources, lambda r: not r.has_tags())

# Calculate cost
cost = sum(untagged.costs())
```

**✅ Good:**
```python
import boto3

ec2 = boto3.client('ec2')
ce = boto3.client('ce')

# [Full working example with error handling]
```

### Anti-Pattern 3: Vague Outcomes

**❌ Bad:**
> After implementing our recommendations, the company saw significant savings and improved efficiency.

**✅ Good:**
> After implementing ZopNight's automated scheduling across 500 instances, Acme Corp achieved:
>
> - **$18,400/month sustained savings** (38.4% reduction)
> - **Zero SLA breaches** from resource scheduling
> - **14 minutes average time** to review daily recommendations
> - **Break-even in 2.7 months** (initial implementation cost recovered)

### Anti-Pattern 4: No Visuals

**❌ Bad:**
> The FinOps lifecycle consists of three phases: Inform, Optimize, and Operate. In the Inform phase, you gather cost data and create visibility. In the Optimize phase, you implement cost-saving measures. In the Operate phase, you enforce policies and continuously improve.

**✅ Good:**
> The FinOps lifecycle consists of three phases:
>
> [D2 diagram showing Inform → Optimize → Operate with feedback loop]
>
> **Inform phase:** Connect cloud accounts, aggregate billing, build dashboards...

---

## Next Steps

1. **Run content audit** on your ebook: `make audit ebook=<slug>`
2. **Review violations** and prioritize fixes (focus on chapters with most violations)
3. **Use templates** to add missing elements (diagrams, calculators)
4. **Transform 1 chapter** as a proof-of-concept
5. **Compare before/after** using `make compare`

**Additional Resources:**
- [D2 Diagram Guide](./D2_DIAGRAM_GUIDE.md) — Add diagrams
- [Observable JS Patterns](./OBSERVABLE_JS_PATTERNS.md) — Add calculators
- [SOTA Chapter Template](_templates/sota-chapter-template.qmd) — Full example
- [Quality Thresholds](../quality-thresholds.yml) — Customize standards

**Questions?** Check `scripts/content-audit.ts` source code, or ask in #ebook-engine Slack.
