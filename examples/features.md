---
theme: swiss
short: Features
---

#### October 2026
# What's new in Cue
### Charts, callouts, timers and more

---

// chart: bar
## Revenue by quarter

	| Quarter | Revenue |
	|---|--:|
	| Q1 | $1.2M |
	| Q2 | $1.9M |
	| Q3 | $2.4M |
	| Q4 | $3.1M |

---

// chart: line
## Weekly active people

	| Week | Teams | Solo |
	|---|--:|--:|
	| 1 | 1,200 | 800 |
	| 2 | 1,450 | 950 |
	| 3 | 1,700 | 1,020 |
	| 4 | 2,300 | 1,180 |

---

## By the numbers

### 38%
	Revenue growth

### $4.2M
	New revenue

### 118%
	Net retention

---

## Callouts

	> [!TIP]
	> Rehearse twice.

	> [!WARNING] Before you present
	> Turn off notifications.

---

## Code with focus

	```ts {2-3}
	export function fit(slide: HTMLElement): number {
	  const inner = slide.querySelector('.s-inner');
	  if (!inner) return 0; // nothing to measure
	  return inner.scrollHeight;
	}
	```

---

// image: contain
## Whole images

	`// image: contain` shows logos and diagrams uncropped.

![](samples/tide.jpg)

---

// timer: 5:00
## Break

	Back in five minutes.
