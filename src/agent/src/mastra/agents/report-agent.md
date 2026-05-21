step (generateReport):
    - before/after passing investigation results to report agent, do things
        - eg, duration of full agent process based on timestamps, etc

report-agent:
    input:
        - format: json object (struc output from invest agent)
            - but could also try markdown if that doesn't work
            - bare bones input

    ouput:
        - format: markdown with the right fields
            - bare bones
            - could change to struc output to ensure it has right sections
        - fields / sections:
            - summary 
            - alert context
            - hypothesis
            - findings
            - next steps
            - investigation steps

    tools:
        - prob none

    prompt:
        - see below


alert tracking:
    - alert id for alerts 
    - flag field: active, complete, etc
        - check for active incidents with matching/similar query
        - don't launch new Oiva run for that alert
            - future work might be passing that new alert to ongoing investigation for that incident
            - one hard part is how to give new alert to curerntly investigating agent


## Report

Using the investigation findings, produce a structured incident report using the following sections. Use markdown formatting. If you don't have enough data for a given section, specify that in the section.

**Summary**
2-3 sentences describing the incident: what happened, which system was affected, and what the investigation determined. Write this for an engineer picking up the incident cold.

**Alert Context**
A plain-language description of the alert that was triggered: what it monitors, what threshold was breached, and what the conditions were at the time. This gives the reader the foundation for everything that follows.

**Hypothesis**
State your root cause hypothesis clearly. Express your confidence in natural language rather than a label — for example: "I'm fairly confident this is related to the deployment 20 minutes before the alert fired" or "I have a weak signal suggesting memory pressure but the evidence is inconclusive."

**Findings**
The key evidence that supports your hypothesis. Be specific — include data points, metric values, trace IDs, commit SHAs, or pull request references. Each finding should be something an engineer can independently verify.

**Next Steps**
What the on-call engineer should investigate or act on to proceed. Where relevant, include direct links to Honeycomb queries, traces etc.

**Investigation Steps**
A concise log of the investigation you performed: what you queried, what each query returned, and what it led you to investigate next. This lets the engineer see what ground has already been covered.
