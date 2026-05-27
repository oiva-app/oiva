# Summary
Alert timestamp: May 18 2026 13:21:03 UTC-04:00 
Environment name: astro-lisa
Trigger name: error == true

## Alert description created by the user:
<missing></missing>

## An automated description of this specific alert:
COUNT of error = true >= 1 over the course of 5 minutes

# What datasets were in the scope of this query?
[\"__all__\"]

Keep in mind that it may be helpful to examine other datasets.

# Important timestamps
| Marker | Description | Time (UTC-04:00) |
|--------|-------------|------------------|
| T1 | Beginning of investigation window | May 18 2026 13:09:03 UTC-04:00 |
| T2 | About when did the problem begin? | unknown |
| T3 | When did the alert fire? | May 18 2026 13:21:03 UTC-04:00 |
| T4 | End of investigation window | May 18 2026 13:27:03 UTC-04:00 |

IMPORTANT: T1 and T4 are approximate.  Start your investigation between those timestamps, but feel free to expand your investigation if you deem necessary

# Full query results
# Results

| COUNT | service.name |
| --- | --- |
| 2736 | product-catalog |
| 2734 | frontend |
| 684 | frontend-proxy |
| 9 | ad |
| 9 | fraud-detection |
| 4 | load-generator |
| 0 | OTHER |
| 6176 | TOTAL |


# Time Series

```
COUNT - load-generator [0.90 - 1.10]
│                                                                                                                        
│                                                                                                                        
│                                                                                                                        
│                                                                                                                        
│                                                                                                                        
│                                                                                                                        
│························································································································
│                                                                                                                        
│                                                                                                                        
│                                                                                                                        
│                                                                                                                        
│                                                                                                                        
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 2026-05-18T17:19Z                                  2026-05-18T17:20Z                                  2026-05-18T17:20Z
```

```
COUNT - frontend [0.00 - 52.7]
│                                                                                                                        
│                                                                                                     ·                  
│    ·                                                                                                                   
│                                                                                                                        
│                                                                                                                        
│ ·           ·       ·     ·                                            ·   ·  ·        ·   ·                           
│          ·                    ·      ·  ·     ·       · ··  ·         ·   ·  ·  ·            ··       ·  ·  ·      ·   
│       ·                 ·        ·       ·                                                    ·                        
│· ··· ·           ·          ·· ··               ·· ·   ··  ··    ·  · ···             ·   ··    ··      ·· ·   ···· ·· 
│      ·          ·        ·              ··        · ·         ·            ·      ·          · ·  ·          ·         
│ ··· · ··········· ·········· ··· ·······  ······· · ···  ···  ········   ·· ·· ··· ··· ···· ·   ·· · ···· ··· ·· ···· ·
│                   ··                   ·   ·       ·         ·                                         ·     ··        
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 2026-05-18T17:18Z                                  2026-05-18T17:19Z                                  2026-05-18T17:21Z
```

```
COUNT - product-catalog [0.00 - 52.7]
│                                                                                                                        
│    ·                                                                                                                   
│                                                                                                      ·                 
│                                                                                                                        
│                                                                               ·                          ·             
│ ·           ·       ·     ·                                           ·   ·             ·   ·                          
│       ·  ·              ·     ·      ·  ·     ·      · ··  ·         ·  ·                     ··  ·    ·    ·          
│                                          ·                             ·    ·   ·                                  ·   
│· ··· ·           ··         ·· ·· ·     ·      ·····  ·   ···   · ·      ·         ·   ·   ·    ··        ··  · ···  · 
│ ·                          ·     ·        ·           ·             ·          ·       ·· ·          ·             ··  
│  ·· · ······ ····  ····· ··· · ········· · ······ ····  ··· ·········  ··· ·  ·· ······  ··  ·  · ··· ··· ·········   ·
│             ·     ··   ·              ·                              ··     ··   ··           ·     ·   ·           ·  
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 2026-05-18T17:18Z                                  2026-05-18T17:19Z                                  2026-05-18T17:21Z
```

```
COUNT - frontend-proxy [1.00 - 13.0]
│                                                                                                                        
│                                                                                                      ·                 
│                                                                                                                        
│    ·                                                                                                                   
│                                                                                                                        
│ ·           ·            ·                                            ·       ·        ·       ·        ·              
│                                                                                                                        
│   ·      ·         ·   ·   · ·  ·   ·  ·     ·  ·    · ··   ·         ·    · ·  ·          · ·         ·    ·      ·   
│                                                                                                                        
│· ·  ···         ··       · ·· ··        ·      ·  ·   ··   ·     · · · ····       ·   ·   ·   ·  ··       ··   ···· ·· 
│                                                                                                                        
│ ··· · ··········· ······· ·  ··· ······· ···· ········  ··· ··········  · · ·········· ···· ·· ·· ··············· ··· ·
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 2026-05-18T17:18Z                                  2026-05-18T17:19Z                                  2026-05-18T17:21Z
```

```
COUNT - ad [0.90 - 1.10]
│                                                                                                                        
│                                                                                                                        
│                                                                                                                        
│                                                                                                                        
│                                                                                                                        
│                                                                                                                        
│························································································································
│                                                                                                                        
│                                                                                                                        
│                                                                                                                        
│                                                                                                                        
│                                                                                                                        
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 2026-05-18T17:18Z                                  2026-05-18T17:19Z                                  2026-05-18T17:20Z
```

```
COUNT - fraud-detection [0.90 - 1.10]
│                                                                                                                        
│                                                                                                                        
│                                                                                                                        
│                                                                                                                        
│                                                                                                                        
│                                                                                                                        
│························································································································
│                                                                                                                        
│                                                                                                                        
│                                                                                                                        
│                                                                                                                        
│                                                                                                                        
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 2026-05-18T17:18Z                                  2026-05-18T17:19Z                                  2026-05-18T17:20Z
```

# Query Spec

```json
{\"breakdowns\":[\"service.name\"],\"calculations\":[{\"op\":\"COUNT\"}],\"end_time\":1779124863,\"filters\":[{\"column\":\"error\",\"join_column\":\"\",\"op\":\"=\",\"value\":true}],\"limit\":1000,\"orders\":[{\"op\":\"COUNT\",\"order\":\"descending\"}],\"start_time\":1779124683}
```

---
Metadata:
  environment: astro-lisa
  query_result_image: \"https://ui.honeycomb.io/img/8hBDkhzFa8bo9whdZnzJZr3fxuPxbJ5ZBsJimYqq3WL\"
  query_result_json: \"https://mcp.honeycomb.io/query_results/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJxdWVyeV9ydW5fcGsiOiI0U1N6bU5vRlQ4ZCIsInRlYW1faWQiOjExNjY0MSwidXNlcl9pZCI6MCwiZXhwIjoxNzc5OTAyNjM4LCJpYXQiOjE3Nzk5MDE3Mzh9.Kb9ytnYvcC1gLnGabqBRrZdTX0HSk-wrIlbDgQ1nIms\"
  query_run_pk: 4SSzmNoFT8d
  query_url: \"https://ui.honeycomb.io/senorvalenz-gettingstarted/environments/astro-lisa/result/4SSzmNoFT8d\"

