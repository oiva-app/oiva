
# Summary
Alert timestamp: 2026-05-28T16:27:58Z 
Environment name: astro-lisa
Trigger name: Excess 4xx HTTP Status Codes

## Alert description created by the user:
<missing></missing>

## An automated description of this specific alert:
A higher-than normal number of 4xx status codes are firing

# What datasets were in the scope of this query?
["unknown_metrics","otelcol-contrib","product-catalog","checkout","cart","kafka","accounting","recommendation","payment","load-generator","frontend-proxy","image-provider","ad","currency","product-reviews","frontend-web","frontend","quote","shipping","email","fraud-detection"]

Keep in mind that it may be helpful to examine other datasets.

# Important timestamps
| Marker | Description | Time             |
|--------|-------------|------------------|
| T1 | Beginning of investigation window | 2026-05-28T16:08:26Z |
| T2 | About when did the problem begin? | unknown |
| T3 | When did the alert fire? | 2026-05-28T16:27:58Z |
| T4 | End of investigation window | 2026-05-28T16:37:44Z |

IMPORTANT: T1 and T4 are approximate.  Start your investigation between those timestamps, but feel free to expand your investigation if you deem necessary

# Full query results

<QUERY_RESULTS>
# Results

| COUNT | service.name |
| --- | --- |
| 65 | frontend |
| 62 | frontend-proxy |


# Time Series

```
COUNT - frontend [0.70 - 4.30]
│                                                                                         ···                            
│                                                                            ·           ·   ·                           
│                                                                           · ·         ·                                
│                                                                                             ·                          
│                                                                          ·   ·                                         
│                                                                                      ·                                 
│                                                                         ·     ·              ·                         
│                                                                                     ·                                  
│           ·······································       ·············· ·       ·   ·          ·············       ·····
│          ·                                       ·     ·              ·         ···                        ·     ·     
│        ··                                         ·   ·                                                     ·   ·      
│········                                            ···                                                       ···       
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 2026-05-28T16:23Z                                  2026-05-28T16:27Z                                  2026-05-28T16:27Z
```

```
COUNT - frontend-proxy [1.80 - 4.20]
│                                                                                       ····                             
│·                                                                        ·            ·    ·                            
│                                                                        · ·                                             
│ ·                                                                                   ·      ·                           
│                                                                       ·                                                
│                                                                           ·                 ·                          
│  ·                                                                                 ·                                   
│                                                                      ·                       ·                         
│                                                                                                                        
│   ·                                                                 ·      ·      ·           ·                        
│                                                                                                                        
│    ·  ···························································  ·        ·    ·             ·  ·····················
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 2026-05-28T16:25Z                                  2026-05-28T16:27Z                                  2026-05-28T16:27Z
```

# Query Spec

```json
{"breakdowns":["service.name"],"calculations":[{"op":"COUNT"}],"filters":[{"column":"http.status_code","join_column":"","op":"\u003e=","value":400},{"column":"http.status_code","join_column":"","op":"\u003c","value":500}],"orders":[{"op":"COUNT","order":"descending"}],"time_range":300}
```

---
Metadata:
  environment: astro-lisa
  query_result_image: "https://ui.honeycomb.io/img/XgWUTTynTnQ2rgjG6RameMfxVzYwKofsTd6OvleiU2cA"
  query_result_json: "https://mcp.honeycomb.io/query_results/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJxdWVyeV9ydW5fcGsiOiI1Q1l0Z1VicGRUIiwidGVhbV9pZCI6MTE2NjQxLCJ1c2VyX2lkIjowLCJleHAiOjE3ODAwMTYxODYsImlhdCI6MTc4MDAxNTI4Nn0.MnAzJ-U3QBAHFCgFLvqRVi1K4Bv8UbeQ8pkA6vtCr3M"
  query_run_pk: 5CYtgUbpdT
  query_url: "https://ui.honeycomb.io/senorvalenz-gettingstarted/environments/astro-lisa/result/5CYtgUbpdT"

</QUERY_RESULTS>
