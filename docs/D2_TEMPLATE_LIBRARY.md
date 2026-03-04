# D2 Diagram Templates for FinOps Ebooks

These templates create professional, SOTA-quality diagrams for Zopdev ebooks.

## Template 1: Cloud Architecture with Cost Annotations

```d2
# templates/cloud-architecture-with-costs.d2
# Purpose: Show infrastructure layout with cost breakdowns

direction: right

vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
    pad: 20
  }
}

style: {
  font: "Inter"
  font-size: 14
  stroke-width: 2
}

aws_cloud: AWS Cloud {
  style.fill: "#FF9900"
  style.fill-opacity: 0.1
  style.stroke: "#FF9900"
  
  vpc: Production VPC\nus-east-1 {
    style.fill: "#ffffff"
    style.stroke: "#0891b2"
    style.stroke-width: 2
    
    cost_annotation: $45K/month {
      shape: text
      style.font-size: 12
      style.font-color: "#0891b2"
      style.bold: true
    }
    
    alb: Application Load Balancer {
      style.fill: "#FF9900"
      style.font-color: "#ffffff"
      
      cost: $250/mo {
        shape: text
        style.font-size: 10
      }
    }
    
    eks_cluster: EKS Cluster\n(v1.28) {
      style.fill: "#e3f2fd"
      style.stroke: "#0891b2"
      
      cluster_cost: Control Plane: $73/mo {
        shape: text
        style.font-size: 10
      }
      
      node_group_1: Node Group: Production\n(m5.2xlarge × 12) {
        style.fill: "#0891b2"
        style.font-color: "#ffffff"
        
        node_cost: $3,317/mo {
          shape: text
          style.font-size: 10
        }
      }
      
      node_group_2: Node Group: Batch\n(c5.large × 8) {
        style.fill: "#16a34a"
        style.font-color: "#ffffff"
        
        batch_cost: $561/mo {
          shape: text
          style.font-size: 10
        }
      }
    }
    
    rds: RDS PostgreSQL\ndb.r5.2xlarge (Multi-AZ) {
      style.fill: "#527FFF"
      style.font-color: "#ffffff"
      
      db_cost: $1,248/mo {
        shape: text
        style.font-size: 10
      }
    }
    
    s3: S3 Buckets\n24TB Standard + IA {
      style.fill: "#569A31"
      style.font-color: "#ffffff"
      
      storage_cost: $428/mo {
        shape: text
        style.font-size: 10
      }
    }
  }
  
  cloudwatch: CloudWatch\nLogs + Metrics {
    style.fill: "#fbbf24"
    
    monitoring_cost: $892/mo {
      shape: text
      style.font-size: 10
    }
  }
}

zopnight: ZopNight {
  shape: rectangle
  style.fill: "#0891b2"
  style.stroke: "#002D8E"
  style.font-color: "#ffffff"
  style.shadow: true
  
  capabilities: |md
    • Resource Scheduling
    • Right-Sizing Analysis
    • Cost Anomaly Detection
    • Policy Enforcement
  |
}

# Connections
aws_cloud.vpc.alb -> aws_cloud.vpc.eks_cluster: Routes Traffic
aws_cloud.vpc.eks_cluster -> aws_cloud.vpc.rds: Database Queries
aws_cloud.vpc.eks_cluster -> aws_cloud.vpc.s3: Object Storage
aws_cloud.vpc -> aws_cloud.cloudwatch: Metrics & Logs

zopnight -> aws_cloud.vpc.eks_cluster: Schedule Actions {
  style.stroke: "#0891b2"
  style.stroke-dash: 5
}

zopnight -> aws_cloud.cloudwatch: Read Metrics {
  style.stroke: "#0891b2"
  style.stroke-dash: 5
}

# Savings annotation
savings_badge: Potential Savings:\n$18K/month (40%) {
  shape: circle
  style.fill: "#16a34a"
  style.font-color: "#ffffff"
  style.font-size: 16
  style.shadow: true
  style.3d: true
}

zopnight -> savings_badge {
  style.stroke: "#16a34a"
  style.stroke-dash: 3
}
```

---

## Template 2: FinOps Workflow / Process Flow

```d2
# templates/finops-workflow.d2
# Purpose: Show the FinOps lifecycle phases

direction: down

vars: {
  d2-config: {
    layout-engine: elk
    theme-id: 1
  }
}

# Phase 1: Inform
inform_phase: INFORM PHASE {
  shape: rectangle
  style.fill: "#e3f2fd"
  style.stroke: "#0891b2"
  style.stroke-width: 3
  
  visibility: 1. Visibility {
    shape: rectangle
    style.fill: "#ffffff"
    
    tasks: |md
      • Connect cloud accounts
      • Aggregate billing data
      • Build cost dashboards
      **Target: 100% account coverage**
    |
  }
  
  allocation: 2. Allocation {
    shape: rectangle
    style.fill: "#ffffff"
    
    tasks: |md
      • Implement tagging strategy
      • Attribute costs to teams
      • Generate showback reports
      **Target: 80%+ tag coverage**
    |
  }
  
  benchmarking: 3. Benchmarking {
    shape: rectangle
    style.fill: "#ffffff"
    
    tasks: |md
      • Track unit economics
      • Compare to industry peers
      • Set efficiency targets
      **Target: Cost per customer metric**
    |
  }
  
  visibility -> allocation -> benchmarking
}

# Phase 2: Optimize
optimize_phase: OPTIMIZE PHASE {
  shape: rectangle
  style.fill: "#e8f5e9"
  style.stroke: "#16a34a"
  style.stroke-width: 3
  
  rate: 4. Rate Optimization {
    shape: rectangle
    style.fill: "#ffffff"
    
    tasks: |md
      • Purchase reserved instances
      • Negotiate enterprise agreements
      • Optimize commitment portfolio
      **Target: 70% RI coverage, 85% utilization**
    |
  }
  
  usage: 5. Usage Optimization {
    shape: rectangle
    style.fill: "#ffffff"
    
    tasks: |md
      • Right-size over-provisioned resources
      • Shut down idle resources
      • Implement scheduling
      **Target: 30% waste reduction**
    |
  }
  
  architecture: 6. Architecture {
    shape: rectangle
    style.fill: "#ffffff"
    
    tasks: |md
      • Serverless for variable loads
      • Spot instances for batch
      • Caching layers
      **Target: 50% cost per transaction**
    |
  }
  
  rate -> usage -> architecture
}

# Phase 3: Operate
operate_phase: OPERATE PHASE {
  shape: rectangle
  style.fill: "#fff3e0"
  style.stroke: "#fbbf24"
  style.stroke-width: 3
  
  governance: 7. Governance {
    shape: rectangle
    style.fill: "#ffffff"
    
    tasks: |md
      • Enforce tagging policies
      • Set budget alerts
      • Define approval workflows
      **Target: Policy-as-code for all**
    |
  }
  
  automation: 8. Automation {
    shape: rectangle
    style.fill: "#ffffff"
    
    tasks: |md
      • Anomaly detection
      • Auto-remediation
      • Continuous right-sizing
      **Target: 90% automated actions**
    |
  }
  
  improvement: 9. Continuous Improvement {
    shape: rectangle
    style.fill: "#ffffff"
    
    tasks: |md
      • Quarterly reviews
      • Maturity assessments
      • Team training
      **Target: Walk → Run maturity**
    |
  }
  
  governance -> automation -> improvement
}

# Flow between phases
inform_phase -> optimize_phase: Data-Driven Actions {
  style.stroke: "#0891b2"
  style.stroke-width: 2
}

optimize_phase -> operate_phase: Sustained Savings {
  style.stroke: "#16a34a"
  style.stroke-width: 2
}

operate_phase -> inform_phase: Feedback Loop {
  style.stroke: "#fbbf24"
  style.stroke-width: 2
  style.stroke-dash: 5
}

# Maturity indicator
maturity: Current Maturity Level {
  shape: text
  style.font-size: 12
  style.bold: true
}

crawl: Crawl\n(Basic visibility) {
  shape: circle
  style.fill: "#ef4444"
  style.font-color: "#ffffff"
}

walk: Walk\n(Proactive optimization) {
  shape: circle
  style.fill: "#fbbf24"
  style.font-color: "#ffffff"
}

run: Run\n(Automated excellence) {
  shape: circle
  style.fill: "#16a34a"
  style.font-color: "#ffffff"
}

maturity -> crawl -> walk -> run {
  style.stroke-dash: 0
}
```

---

## Template 3: Multi-Cloud Comparison

```d2
# templates/multi-cloud-comparison.d2
# Purpose: Compare costs/features across cloud providers

direction: right

vars: {
  d2-config: {
    layout-engine: elk
    theme-id: 1
  }
}

workload: Workload Requirements {
  shape: rectangle
  style.fill: "#f8f9fa"
  style.stroke: "#6c757d"
  
  specs: |md
    **Compute:** 100 vCPUs, 400GB RAM
    **Storage:** 10TB block, 50TB object
    **Database:** PostgreSQL, 2TB, Multi-AZ
    **Traffic:** 50TB egress/month
  |
}

aws: AWS Solution {
  shape: rectangle
  style.fill: "#FF9900"
  style.fill-opacity: 0.1
  style.stroke: "#FF9900"
  
  compute: EC2: m5.4xlarge × 6\n(3-year RI) {
    style.fill: "#ffffff"
    cost: $2,847/mo
  }
  
  storage_block: EBS: 10TB gp3 {
    style.fill: "#ffffff"
    cost: $800/mo
  }
  
  storage_object: S3: 50TB Standard-IA {
    style.fill: "#ffffff"
    cost: $625/mo
  }
  
  database: RDS: db.r5.2xlarge Multi-AZ {
    style.fill: "#ffffff"
    cost: $1,248/mo
  }
  
  egress: Data Transfer Out {
    style.fill: "#ffffff"
    cost: $4,300/mo
  }
  
  total_aws: Total: $9,820/month {
    shape: text
    style.bold: true
    style.font-size: 16
    style.font-color: "#FF9900"
  }
  
  compute -> storage_block -> storage_object -> database -> egress -> total_aws
}

gcp: GCP Solution {
  shape: rectangle
  style.fill: "#4285F4"
  style.fill-opacity: 0.1
  style.stroke: "#4285F4"
  
  compute: Compute Engine: n2-highmem-16 × 4\n(3-year CUD) {
    style.fill: "#ffffff"
    cost: $2,124/mo
  }
  
  storage_block: Persistent Disk: 10TB SSD {
    style.fill: "#ffffff"
    cost: $1,700/mo
  }
  
  storage_object: Cloud Storage: 50TB Nearline {
    style.fill: "#ffffff"
    cost: $500/mo
  }
  
  database: Cloud SQL: db-highmem-16 HA {
    style.fill: "#ffffff"
    cost: $987/mo
  }
  
  egress: Network Egress {
    style.fill: "#ffffff"
    cost: $4,100/mo
  }
  
  total_gcp: Total: $9,411/month {
    shape: text
    style.bold: true
    style.font-size: 16
    style.font-color: "#4285F4"
  }
  
  compute -> storage_block -> storage_object -> database -> egress -> total_gcp
}

azure: Azure Solution {
  shape: rectangle
  style.fill: "#0078D4"
  style.fill-opacity: 0.1
  style.stroke: "#0078D4"
  
  compute: VMs: E16s v5 × 4\n(3-year RI) {
    style.fill: "#ffffff"
    cost: $2,456/mo
  }
  
  storage_block: Managed Disks: 10TB Premium SSD {
    style.fill: "#ffffff"
    cost: $1,228/mo
  }
  
  storage_object: Blob Storage: 50TB Cool {
    style.fill: "#ffffff"
    cost: $512/mo
  }
  
  database: PostgreSQL: 16 vCore, Zone Redundant {
    style.fill: "#ffffff"
    cost: $1,106/mo
  }
  
  egress: Bandwidth {
    style.fill: "#ffffff"
    cost: $4,250/mo
  }
  
  total_azure: Total: $9,552/month {
    shape: text
    style.bold: true
    style.font-size: 16
    style.font-color: "#0078D4"
  }
  
  compute -> storage_block -> storage_object -> database -> egress -> total_azure
}

workload -> aws: Deploy Option 1
workload -> gcp: Deploy Option 2
workload -> azure: Deploy Option 3

winner: Best Value: GCP\nSavings: $409/mo vs AWS {
  shape: circle
  style.fill: "#16a34a"
  style.font-color: "#ffffff"
  style.shadow: true
}

gcp -> winner
```

---

## Template 4: Before/After Optimization

```d2
# templates/before-after-optimization.d2
# Purpose: Show impact of cost optimization

direction: right

before_state: BEFORE OPTIMIZATION {
  style.fill: "#ffebee"
  style.stroke: "#ef4444"
  style.stroke-width: 2
  
  problem_desc: |md
    ## The Situation
    - No resource scheduling
    - Over-provisioned instances
    - 24/7 non-prod environments
    - Zero RI coverage
  |
  
  architecture: Infrastructure {
    dev: Dev Environment\n24/7 runtime {
      style.fill: "#ffffff"
      instances: m5.2xlarge × 20
      cost: $5,530/mo
    }
    
    staging: Staging Environment\n24/7 runtime {
      style.fill: "#ffffff"
      instances: m5.2xlarge × 15
      cost: $4,147/mo
    }
    
    prod: Production\nOn-demand instances {
      style.fill: "#ffffff"
      instances: m5.xlarge × 40
      cost: $5,606/mo
    }
    
    dev -> staging -> prod
  }
  
  total_before: Monthly Cost: $15,283 {
    shape: text
    style.font-size: 20
    style.bold: true
    style.font-color: "#ef4444"
  }
  
  problem_desc -> architecture -> total_before
}

after_state: AFTER OPTIMIZATION {
  style.fill: "#e8f5e9"
  style.stroke: "#16a34a"
  style.stroke-width: 2
  
  solution_desc: |md
    ## The Changes
    ✅ Scheduled dev/staging (12h/day, weekdays only)
    ✅ Right-sized all instances
    ✅ Production: 70% RI coverage
    ✅ Spot instances for batch jobs
  |
  
  architecture: Infrastructure {
    dev: Dev Environment\n60h/week runtime {
      style.fill: "#ffffff"
      instances: m5.large × 20
      cost: $1,108/mo
    }
    
    staging: Staging Environment\n60h/week runtime {
      style.fill: "#ffffff"
      instances: m5.large × 15
      cost: $831/mo
    }
    
    prod: Production\n70% RI, 30% On-Demand {
      style.fill: "#ffffff"
      instances: m5.large × 40
      cost: $2,246/mo
    }
    
    dev -> staging -> prod
  }
  
  total_after: Monthly Cost: $4,185 {
    shape: text
    style.font-size: 20
    style.bold: true
    style.font-color: "#16a34a"
  }
  
  solution_desc -> architecture -> total_after
}

transformation: Transformation {
  style.stroke: "#0891b2"
  style.stroke-width: 3
  style.stroke-dash: 5
}

before_state -> transformation -> after_state

savings_impact: |md
  ## Impact
  **Monthly Savings:** $11,098 (73% reduction)
  **Annual Savings:** $133,176
  **Implementation Time:** 2 weeks
  **ROI:** 2,664%
| {
  shape: rectangle
  style.fill: "#0891b2"
  style.font-color: "#ffffff"
  style.shadow: true
  style.multiple: true
}

after_state -> savings_impact
```

---

## Template 5: ZopNight Architecture

```d2
# templates/zopnight-architecture.d2
# Purpose: Show how ZopNight integrates with cloud infrastructure

direction: down

user: Engineering Team {
  shape: person
  style.fill: "#6c757d"
}

zopnight_ui: ZopNight Dashboard {
  style.fill: "#0891b2"
  style.font-color: "#ffffff"
  
  features: |md
    • Cost Visibility
    • Schedule Management
    • Policy Editor
    • Savings Reports
  |
}

zopnight_api: ZopNight API Server {
  style.fill: "#002D8E"
  style.font-color: "#ffffff"
  
  scheduler: Scheduler Engine
  policy_engine: Policy Engine
  metrics_collector: Metrics Collector
  
  scheduler -> policy_engine -> metrics_collector
}

cloud_providers: Cloud Infrastructure {
  style.fill: "#f8f9fa"
  style.stroke: "#6c757d"
  
  aws: AWS {
    style.fill: "#FF9900"
    style.fill-opacity: 0.2
    
    ec2: EC2 Instances
    rds: RDS Databases
    eks: EKS Clusters
    
    ec2 -> rds -> eks
  }
  
  gcp: GCP {
    style.fill: "#4285F4"
    style.fill-opacity: 0.2
    
    gce: Compute Engine
    cloudsql: Cloud SQL
    gke: GKE Clusters
    
    gce -> cloudsql -> gke
  }
}

monitoring: Observability {
  style.fill: "#fbbf24"
  
  cloudwatch: CloudWatch
  prometheus: Prometheus
  grafana: Grafana
  
  cloudwatch -> prometheus -> grafana
}

# Connections
user -> zopnight_ui: Configure Policies
zopnight_ui -> zopnight_api: API Calls

zopnight_api.scheduler -> cloud_providers.aws: Start/Stop Actions {
  style.stroke: "#16a34a"
  style.stroke-width: 2
}

zopnight_api.scheduler -> cloud_providers.gcp: Schedule Resources {
  style.stroke: "#16a34a"
  style.stroke-width: 2
}

zopnight_api.metrics_collector -> monitoring: Read Metrics {
  style.stroke: "#0891b2"
  style.stroke-dash: 5
}

cloud_providers -> monitoring: Emit Metrics {
  style.stroke: "#6c757d"
  style.stroke-dash: 5
}

# Savings annotation
savings: Automated Savings:\n$45K/month {
  shape: circle
  style.fill: "#16a34a"
  style.font-color: "#ffffff"
  style.shadow: true
  style.font-size: 16
}

zopnight_api -> savings
```

---

## Usage in Quarto

### Method 1: Inline D2 Code

```markdown
::: {.column-page}
```{d2}
direction: right
aws: AWS {
  ec2: EC2 Instances
}
zopnight: ZopNight {
  style.fill: "#0891b2"
}
zopnight -> aws.ec2: Schedule
```
:::
```

### Method 2: External D2 File

```markdown
::: {.column-page}
```{d2}
//| file: diagrams/cloud-architecture.d2
//| width: 100%
//| height: 600
```
:::
```

### Method 3: With Caption

```markdown
::: {#fig-architecture}
```{d2}
//| file: diagrams/finops-workflow.d2
```

The FinOps lifecycle showing Inform → Optimize → Operate phases with continuous feedback.
:::
```

---

## D2 Styling Best Practices

### Zopdev Color Palette
```d2
# Always use Zopdev brand colors:
primary: #0891b2   (Zop Blue)
secondary: #002D8E (Zop Dark Blue)
success: #16a34a   (Green)
warning: #fbbf24   (Orange)
danger: #ef4444    (Red)
neutral: #6c757d   (Gray)
```

### Typography
```d2
vars: {
  d2-config: {
    theme-id: 1
  }
}

style: {
  font: "Inter"           # Match ebook font
  font-size: 14           # Readable but not huge
  stroke-width: 2         # Clean, professional lines
}
```

### Layout Engines
- **elk**: Best for complex hierarchies (default for most)
- **dagre**: Good for simple flows
- **tala**: Experimental, very clean layouts

---

## Quick Reference

| Diagram Type | Template | Use When |
|-------------|----------|----------|
| Infrastructure | cloud-architecture-with-costs.d2 | Showing AWS/GCP/Azure setups |
| Process Flow | finops-workflow.d2 | Explaining FinOps phases |
| Comparison | multi-cloud-comparison.d2 | Comparing provider costs |
| Before/After | before-after-optimization.d2 | Demonstrating savings |
| Product | zopnight-architecture.d2 | Explaining ZopNight features |

Remember: Every diagram should have **cost annotations** where relevant to reinforce the FinOps value proposition.
