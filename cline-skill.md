Skills
Modular instruction sets that extend Cline’s capabilities for specific tasks.

Skills are modular instruction sets that extend Cline’s capabilities for specific tasks. Each skill packages detailed guidance, workflows, and optional resources that Cline loads only when relevant to your request.
Install multiple skills and Cline only loads what it needs. A deployment skill stays dormant until you ask about deploying. Unlike rules (which are always active), skills load on-demand so they don’t consume context when you’re working on something unrelated.
Skills is an experimental feature. Enable it in Settings → Features → Enable Skills.
​
How Skills Work
Skills use progressive loading to maximize efficiency:
Level	When Loaded	Token Cost	Content
Metadata	Always (at startup)	~100 tokens per skill	name and description from YAML frontmatter
Instructions	When skill is triggered	Under 5k tokens	SKILL.md body with instructions and guidance
Resources	As needed	Effectively unlimited	Bundled files accessed via read_file or executed scripts
When you send a message, Cline sees a list of available skills with their descriptions. If your request matches a skill’s description, Cline activates it using the use_skill tool, which loads the full instructions from SKILL.md.
​
Skill Structure
Every skill is a directory containing a SKILL.md file with YAML frontmatter.
Skill directory structure
my-skill/
├── SKILL.md          # Required: main instructions
├── docs/             # Optional: additional documentation
│   └── advanced.md
└── scripts/          # Optional: utility scripts
    └── helper.sh
The SKILL.md file has two parts: metadata and instructions.
SKILL.md
---
name: my-skill
description: Brief description of what this skill does and when to use it.
---

# My Skill

Detailed instructions for Cline to follow when this skill is activated.

## Steps
1. First, do this
2. Then do that
3. For advanced usage, see [advanced.md](docs/advanced.md)
Required fields:
name must exactly match the directory name
description tells Cline when to use this skill (max 1024 characters)
​
Creating a Skill
1
Open the Skills menu

Click the scale icon at the bottom of the Cline panel, to the left of the model selector. Switch to the Skills tab.
2
Create a new skill

Click “New skill…” and enter a name for your skill (e.g., aws-deploy). Cline creates a skill directory with a template SKILL.md file.
3
Write your skill instructions

Edit the SKILL.md file:
Update the description field to specify when this skill should trigger
Add detailed instructions in the body
Optionally add supporting files in docs/, templates/, or scripts/ subdirectories
You can also create skills manually by creating the directory structure in your file system. Place skill directories in .cline/skills/ (workspace) or ~/.cline/skills/ (global) and Cline will detect them automatically.
Put the important information first in your SKILL.md. Cline reads the file sequentially, so front-load the common cases. Use clear section headers like ”## Error Handling” or ”## Configuration” so Cline can scan for relevant sections.
​
Toggling Skills
Every skill has a toggle to enable or disable it. This lets you control which skills are active without deleting the skill directory. Skills are enabled by default when discovered.
For example, you might disable a CI/CD skill when working on local development, or enable a client-specific skill only when working on that client’s project.
​
Writing Your SKILL.md
​
Naming Conventions
The skill name appears in the name field and must match the directory name exactly. Use lowercase with hyphens (kebab-case) and be descriptive about what the skill does.
Good names:
aws-cdk-deploy
pr-review-checklist
database-migration
api-client-generator
Avoid:
aws (too vague)
my_skill (underscores, not descriptive)
DeployToAWS (use kebab-case, not PascalCase)
misc-helpers (too generic)
​
Writing Effective Descriptions
The description determines when Cline activates the skill. A vague description means the skill won’t trigger when you expect it to.
Good descriptions are specific and actionable:
description: Deploy applications to AWS using CDK. Use when deploying, updating infrastructure, or managing AWS resources.

description: Generate release notes from git commits. Use when preparing releases, writing changelogs, or summarizing recent changes.

description: Analyze CSV and Excel data files. Use when exploring datasets, generating statistics, or creating visualizations from tabular data.
Weak descriptions leave too much ambiguity:
description: Helps with AWS stuff.

description: Data analysis helper.

description: Useful for releases.
Start with what the skill does (action verbs), include trigger phrases users might say, and mention specific file types, tools, or domains. Test your descriptions by trying different phrasings of requests to see if the skill triggers.
​
Keeping Skills Focused
Keep SKILL.md under 5k tokens. If your skill needs more content, split it into separate files in a docs/ directory and reference them from the main instructions. Cline loads referenced files only when needed.
Include real examples. Show what commands to run, what output to expect, and what the result should look like. Abstract instructions are harder to follow than concrete examples.
​
Where Skills Live
Skills can be stored globally or in a project workspace. See Storage Locations for guidance on when to use each.
Project skills:
.cline/skills/ (recommended)
.clinerules/skills/
.claude/skills/
Global skills:
~/.cline/skills/ (macOS/Linux)
C:\Users\USERNAME\.cline\skills\ (Windows)
When a global skill and project skill have the same name, the global skill takes precedence. This lets you keep general-purpose skills globally while using project-specific skills in .cline/skills/ so the whole team can use them.
Version control your project skills by committing .cline/skills/. Your team can share, review, and improve them together.
​
Bundling Supporting Files
Skills can include additional files that Cline accesses only when needed.
Directory structure
complex-skill/
├── SKILL.md
├── docs/
│   ├── setup.md
│   └── troubleshooting.md
├── templates/
│   └── config.yaml
└── scripts/
    └── validate.py
​
docs/
Use docs for information that’s too detailed for SKILL.md or only relevant in specific situations:
Advanced configuration options
Troubleshooting guides for edge cases
Reference material (API schemas, database schemas)
Platform-specific instructions
A deployment skill might have docs/aws.md, docs/gcp.md, and docs/azure.md. Cline loads only the relevant platform guide based on your request.
​
templates/
Use templates when your skill creates configuration files, boilerplate code, or structured documents:
Config files (Terraform, Docker Compose, CI/CD pipelines)
Code scaffolding (component templates, test fixtures)
Documentation templates (README, API docs)
A project setup skill could include templates/dockerfile, templates/docker-compose.yml, and templates/.env.example that Cline customizes for each new project.
​
scripts/
Use scripts for deterministic operations where you want consistent behavior:
Validation (linting configs, checking prerequisites)
Data processing (parsing, formatting, transforming)
Complex calculations (cost estimation, resource sizing)
API interactions (fetching data, running health checks)
Scripts are token-efficient because only their output enters context, not the code itself. A 500-line validation script produces a simple “Passed” or detailed error messages without consuming any context for the script logic.
​
Referencing Bundled Files
Reference these files in your SKILL.md instructions:
SKILL.md (referencing bundled files)
For initial setup, follow [setup.md](docs/setup.md).
Use the config template at `templates/config.yaml` as a starting point.
Run the validation script to check your configuration:

python scripts/validate.py
Cline reads documentation files using read_file when the instructions reference them. Scripts can be executed directly, and only the script’s output enters the context window.
Use Scripts For	Use Instructions For
Deterministic operations (validation, formatting)	Flexible guidance that adapts to context
Complex computations	Decision-making workflows
Operations that need reliability	Steps that might vary by situation
Anything you’d rather not consume tokens explaining	Best practices and patterns
​
Example: Data Analysis Skill
Here’s a practical skill for data analysis tasks. Create a directory called data-analysis/ with this SKILL.md:
data-analysis/SKILL.md
---
name: data-analysis
description: Analyze data files and generate insights. Use when working with CSV, Excel, or JSON data files that need exploration, cleaning, or visualization.
---

# Data Analysis

When analyzing data files, follow this workflow:

## 1. Understand the Data
- Read a sample of the file to understand its structure
- Identify column types and data quality issues
- Note any missing values or anomalies

## 2. Ask Clarifying Questions
Before diving in, ask the user:
- What specific insights are they looking for?
- Are there any known data quality issues?
- What format do they want for the output?

## 3. Perform Analysis
Use pandas for data manipulation:

import pandas as pd

# Load and explore
df = pd.read_csv("data.csv")
print(df.head())
print(df.describe())
print(df.info())

For visualization, prefer matplotlib or seaborn depending on complexity.
Skills transform Cline from a general-purpose assistant into a specialist that knows your domain. Start with one skill for a task you repeat often, test it, and iterate on the description until it triggers reliably.




## Separate article

Introduction
Cline, the popular open-source extension for VSCode, has introduced a new experimental feature called Skills — based on Anthropic’s Claude Skills. Much like MCP, Anthropic have also released this as an open-standard (see here for more details). Skills provides a modular, on-demand instruction set for specialised tasks, such as code execution or business workflows such as preparing presentations. This blog provides a quick walkthrough of Skills in VSCode using Cline. We’ll cover briefly what they are, how they compare to MCP, and how you can create, enable, and manage your own.

We’ll also look at creating custom skills based on a custom MCP server I previously created for managing the OCI Data Science service. You can find the Skills on my GitHub here.

Note: I used GPT5 to refactor my MCP server as Skills and not every feature has been tested yet. I will continue to update the repo as I test and fix the refactored Skills.

What are Skills?
Skills are self-contained instruction sets that extend Cline’s capabilities for specific tasks. Unlike always-on Rules, Skills are discoverable but only fully loaded when relevant to your request. This means you can install as many as you need without overloading the context or affecting performance.

Skills are great for complex workflows, since they leverage Markdown files for the logic they can be used for both developer and business workflows.

How are Skills different to MCP?
Skills and MCP are similar in that they both extend Cline’s capabilities through specialised, task-specific instructions.

Both are designed to modularise domain knowledge or processes so they can be invoked on demand, rather than embedded directly or managed manually each time. Skills are natively integrated into Cline, using a simple directory structure with SKILL.md files and optional supporting documents or scripts. This integration means Skills load only when needed, optimising context and performance within Cline itself.

MCP servers, on the other hand, operate as external services, communicating with Cline over a defined protocol (STDIO, HTTP, etc.) to process instructions outside the local tool. While this allows for more complex interactions, such as integrating with custom infrastructure or APIs, it also adds deployment and maintenance overheads and may increase context required to load the Tools compared to the lighter Skills approach.

By comparison, Skills are self-contained, easier to manage, and contextually efficient, while MCP servers support more advanced functionality at the expense of simplicity. MCP is still useful, particularly if you want to host the server to make it available for multiple developers over HTTP or make it available for Agents running in separate cloud instances.

The below table summarises some of the pros and cons of MCP and Skills for easy comparison.


How to Enable Skills
In Cline, Skills are experimental (at time of writing with release 3.49.0) and needs to be enabled manually in Cline. To do this:

Go to Settings → Features → Enable Skills.
Once enabled, the “Skills” tab will appear under the rules and workflows panel (click the scale icon below the chat input).
From here, you can view, toggle, or create skills as needed.

Creating Custom Skills
A Skill is just a directory with a SKILL.md file containing YAML front-matter and your instructions. Optionally, you can include supporting docs or utility scripts for more complex workflows (see the documentation for more details).

Sample structure:
The below example is taken from the Cline documentation illustrating how to structure Skills and a minimal example that uses only the SKILL.md file.

Example Folder Structure:

my-skill/
├── SKILL.md          # Required: main instructions
├── docs/             # Optional: additional documentation
│   └── advanced.md
└── scripts/          # Optional: utility scripts
    └── helper.sh
Example minimal SKILL.md:

---
name: data-analysis
description: Analyze data files and generate insights. Use when working with CSV, Excel, or JSON data files that need exploration, cleaning, or visualization.
---

# Data Analysis

When analyzing data files, follow this workflow:

## 1. Understand the Data

- Read a sample of the file to understand its structure
- Identify column types and data quality issues
- Note any missing values or anomalies

## 2. Ask Clarifying Questions

Before diving in, ask the user:
- What specific insights are they looking for?
- Are there any known data quality issues?
- What format do they want for the output?

## 3. Perform Analysis

Use pandas for data manipulation:

```python
import pandas as pd

# Load and explore
df = pd.read_csv("data.csv")
print(df.head())
print(df.describe())
print(df.info())
```

For visualization, prefer matplotlib or seaborn depending on complexity.

## 4. Present Findings

- Start with a summary of key insights
- Support findings with specific numbers
- Include visualizations where they add clarity
- End with recommendations or next steps
In the above Skill definition you can see the similarity with MCP in that you can provide code snippets directly. Compared to MCP it is more readable, but you don’t get the same structure as writing tools as you get with the @mcp.tool decorator.

Loading Skills
Skills can live at both a global and project level:

Global Level Skills
macOS/Linux: ~/.cline/skills
Windows: C:\Users\USERNAME\.cline\skills\
Project Level Skills
.cline/skills/ (recommended for single projects)
.clinerules/skills/
.claude/skills/ (for Claude Code compatibility)
When a global skill and project skill have the same name, the global skill takes precedence. This lets you customise skills for your personal workflow while still using project defaults.

Get Harry Snart’s stories in your inbox
Join Medium for free to get updates from this writer.

Enter your email
Subscribe

Remember me for faster sign in

To manage skills:
- Open the Skills tab in the UI (below the chat input).
- Toggle skills on/off, create new ones from templates, or delete those that are no longer needed.

Example: Converting a custom MCP server to native Skills
Recently I created a custom MCP server for managing OCI Data Science. It provided a set of tools for tasks such as:

Viewing project catalogs
Creating and managing notebook sessions
Running and listing Jobs & Pipelines
If you’re curious, you can view the code for this here.

Convert Existing MCP Server to Skills using GPT5
I cloned the repo locally to make the MCP server code available to Cline. To convert my MCP Server to Skills I used the following prompt, leveraging the useful @ feature that Cline offers to tag folders and URLs for context.

Cline has introduced Skills, as per Anthropic's latest standardised agentic feature. 
You can read the context of Cline Skills here: @https://docs.cline.bot/features/skills 

Given this context, create a set of Skills for my OCI Data Science MCP server. 
You can find the source code under @'/Users/.../oci-data-science-mcp-server'

I want you to create a native Skill that provides the same functionality as the MCP server. 
The reason for this is twofold. 
Firstly, users will eat less context when using the Skill instead of the MCP server. 
Secondly, it demonstrates how we can use Skills to interact with OCI Data Science.
As part of the refactoring, I encouraged GPT5 to re-write a lot of the Python to use the OCI CLI. There was two reasons for this:

Firstly, the CLI is more concise and so it uses even less context than the custom Python Tools
Secondly, it lowers the barrier to entry. Only a few of the Skills retained Python, so users can use the majority of these Skills to manage OCI Data Science without needing to install Python — instead they can just setup the OCI CLI locally to get started
View Skills in UI
Once the Skills were created from the source code they were added to the path .cline/skills in my VSCode Project. There was no need to edit config, the skills get loaded by Cline from the directory automatically. Figure 1 shows the loaded Skills for OCI Data Science.

Press enter or click to view image in full size

Figure 1 — Cline Skills for OCI Data Science
Note: you can make this available globally by saving the Skills under ~/.cline/skills/ instead of making them available at the project level.

One of the things I really liked about Skills was the increased modularity. Its easy to edit the Skills, and turn off parts of it.

Test Skills Work
I then started a new Task using Cline and gave it the following prompt:

Given that my compartment id is ocid1.compartment.. list OCI Data Science Projects in this compartment
I ensured that my MCP server was disabled and that reasoning was enabled so that I could view the thinking and check the Skill was being used. Figure 2 shows the output of the model’s reasoning steps.


Figure 2 — Output of GPT’s thinking when planning the Cline task
We can see from Figure 2 that the output of planing by GPT5 shows that it plans to use the oci-ds-projects Skill to complete its Task. It then produces the correct output when it executes the code. The output is then displayed in the chat, as shown in Figure 3.

Press enter or click to view image in full size

Figure 3 — Response from output of Cline task
Comparing the Skill to the MCP Tool
Let’s take a closer look at the oci-ds-projects Skill and compare it to the equivalent Tool in the OCI Data Science MCP Server, list_projects. In both cases I’ve whittled these down to just the focus on the List Projects capability.

Skill Definition:

---
name: oci-ds-projects
description: Manage OCI Data Science Projects natively using OCI CLI or Python ADS. Use to list, count, create, update, or delete Data Science projects. Requires a compartment_id (set via oci-ds-setup) and explicit confirmation for destructive actions.
---

# OCI Data Science: Projects

Use this skill to manage Data Science Projects without the MCP server. Prefer OCI CLI for simple list/update/delete; use ADS Python only when necessary.

## Preconditions
- compartment_id is known. If not, run oci-ds-setup to choose one and remember it (e.g., as oci.compartment_id).
- OCI CLI is configured (uses ~/.oci/config). Optional: Python packages oci and oracle-ads if using ADS flows.

## Common
- If you only have a project name, resolve to id first:
  ```bash
  # Replace <COMPARTMENT_OCID> and <PROJECT_NAME>
  oci data-science project list --compartment-id <COMPARTMENT_OCID> --all --output json \
    | jq -r '.data[] | select(."display-name"=="<PROJECT_NAME>") | .id'
  ```
- Always confirm with the user before update/delete.

## List Projects
```bash
oci data-science project list --compartment-id <COMPARTMENT_OCID> --all \
  --query "data[].{id:id,name:'display-name',description:description,timeCreated:time-created}" --output table
```

## Notes
- Prefer IDs over names when executing commands.
- For teams, consider applying tags or naming conventions to make filtering simpler via --query.
- If ADS is preferred, ProjectCatalog from oracle-ads can also list/create/delete projects; however, the CLI above is usually simpler and avoids Python dependencies.
MCP Definition:

from fastmcp import FastMCP
from ads.catalog.project import ProjectCatalog
import pandas as pd
from typing import Any, Dict, List

@mcp.tool()
def list_projects(compartment_id) -> Dict:
    ''' returns a list of OCI Data Science Projects by Project Name, Project ID and Project Description as a dictionary 
    
        Args:
        compartment_id: OCI compartment ID. If not provided, will use environment variable COMPARTMENT_ID
    
    Returns:
        List of OCI Data Science Projects in a compartment
    
    '''
    try:
        project_catalog = ProjectCatalog(compartment_id)
        projects = project_catalog.list_projects()
        project_id = []
        project_name = []
        project_desc = []
        for i in range(len(projects)):
            project_id.append(projects[i].id)
            project_name.append(projects[i].display_name)
            project_desc.append(projects[i].description)

        projects_df = pd.DataFrame({'project_id':project_id,'project_name':project_name,'project_description':project_desc}).to_dict('records')
        return projects_df
    except Exception as e:
        print(f"Error getting project list: {e}")
        raise
Overall, there’s not much in it since they are both quite basic and readable. The Python enthusiast in me prefers the MCP Tool in that it is clear code written a bit like a Flask API. That said, the business person in me finds the Skill definition much more readable and clearer from an audit/governance perspective. There is a clearer workflow and code sits alongside the workflow definition. As mentioned above, GPT was encouraged to use the OCI CLI so the embedded code uses bash — but we could easily refactor this to use Python instead.

From a development perspective, I think Skills are well suited to being co-developed with an LLM as there’s a lot of commentary needed for pre-conditions, notes, and project description. Whereas, creating an MCP Tool is straightforward if you are already familiar with Python. If I need to create a Skill in future, I might prefer to unit test the code or wrap it in a simple MCP server before prompting an LLM to create a Skill from the code rather than build the Skill directly.

Summary
Cline’s Skills are a practical way to unlock reusable, on-demand workflows in your environment. Compared to MCP they’re lightweight, context-efficient, and help keep domain knowledge modular. The ability to leverage both Global and Project level Skills is really helpful if you want to customise Global Skills for a particular use case.

I don’t think this necessarily replaces MCP, at least not for now, but it is exciting to see how easy it is now to implement custom workflows, logic and code as reusable blocks in Cline using Skills.

eg. skills on github https://github.com/HarrySnart/oci-data-science-skills