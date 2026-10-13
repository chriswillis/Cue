---
theme: nothing
appearance: light
aspect: 16:9
---

# Welcome to **Cue**.
### ==Write== your talk. ==Cue== the slides.

Behind every great presentation lies a great story. Cue helps you write it, then stays out of your way while it builds a design people will love and remember.

These lines aren't indented, so they're speaker notes. Only you see them, in Presenter view and in the panel next to the slide.

---

	Behind every great presentation lies a great story.

A short indented line with no heading becomes a statement: one idea, set large.

Start with what you want to say. The design follows.

---

## Write first. The slides follow.

	Headings always show. To put any other line on the slide, press Tab at the start of it.

Everything you don't indent stays in your notes. Look at the left margin of the editor: indented lines show a faint ⇥ and take the slide's color.

---

## Three rules

### Separate
	Three dashes on their own line start a new slide.

### Show
	Headings, images and indented lines appear on the slide.

### Say
	Everything else is what you say out loud.

When a slide has several subheadings of the same level, they become columns.

---

#### Part two
## Layouts

Cue picks a layout from what you write. You never place a box. To choose one yourself, add a line like `// layout: split`.

---

## Pictures make room for themselves

	An image on its own line becomes part of the slide. Put it after your text and it sits on the right.

![Dusk](samples/dusk.jpg)

The split layout bleeds the image off the edge of the slide.

---

![Tide](samples/tide.jpg)

## Or lead with the picture

	Put the image first and the layout flips.

---

## A small gallery

![Ochre](samples/ochre.jpg)
![Moss](samples/moss.jpg)
![Tide](samples/tide.jpg)

Two to six images become a gallery.

---

![](samples/dusk.jpg)

An image alone fills the whole slide.

---

## Cue by the numbers

### 16
	Themes, each light and dark

### 14
	Layouts, chosen for you

### 0
	Text boxes to drag

When every column starts with a short number, the numbers become big figures. Units like %, $ or M are set smaller automatically.

---

#### How a talk comes together
// layout: timeline
## From idea to applause

### Write
	Say what you mean, in plain text.

### Shape
	One idea per slide.

### Design
	Pick a theme. Cue does the rest.

### Present
	Your notes, your timer, your story.

`// layout: timeline` hangs the columns from one line, with a dot for each step.

---

// layout: cycle
## Rehearse in a loop
	Until it feels easy

### Write
	Say it in plain text

### Rehearse
	Out loud, with the timer

### Listen
	Where did you stumble?

### Cut
	One idea per slide

`// layout: cycle` puts the columns in a loop of arrows, for work that repeats. Add `// focus: 2` and every step but the second fades back: copy the slide once per step to walk through it.

---

#### Example: a sales review
## $2.9M → $4.2M
	Annual recurring revenue
// count

A title that is only a figure becomes a big number. An arrow between two figures shows the change, and `// count` counts up when you present. Try `// count: roll`, or `// number: ring` on a percentage.

---

## Bullet points, sparingly

	Slides filled with bullet points look like a lot of work and will sabotage your presentation.

	- Use them sparingly
	- Or keep them in your notes as talking points
	- Your audience reads faster than you speak
	- So every bullet competes with your voice

Slides filled with bullet points look like a lot of work and will sabotage your presentation. Use them sparingly, or for your talking points.

---

	> Typography exists to honor content.

	— Robert Bringhurst, [The Elements of Typographic Style](https://www.google.com/search?kgmid=%2Fm%2F02qwn_&q=The+Elements+of+Typographic+Style)

A quote alone gets its own treatment. A last line that starts with a dash becomes the attribution.

---

## Where we are
// layout: agenda

`// layout: agenda` lists the deck's section slides by themselves. The next one lights up and the ones behind you step back, so the same slide works before every part.

---

#### Part three
## The details

---

// chart: bar
## Where the time should go

	| Step | Minutes |
	|---|--:|
	| Writing | 120 |
	| Rehearsing | 90 |
	| Designing | 15 |
	[Example: preparing a 20-minute talk]

Put `// chart: bar` (or `line`) on a slide and its table is drawn as a chart, in the theme's colors.

---

## Code and callouts

	```js {2}
	const deck = parse(script);
	present(deck);
	```

	> [!TIP]
	> Rehearse twice. The second time, use the timer in Presenter view.

Code gets syntax colors, and `{2}` keeps line 2 bright while the rest fades back. Callouts come in NOTE, TIP, IMPORTANT, WARNING and CAUTION.

---

## Change the design, not the words

	Open **Design** to switch themes, fonts, size, colors, header and footer. Your text never changes, so a new look is one click away.

Settings are stored at the top of the file, so they travel with your markdown. The Slide tab has the Markdown guide: click an example to add it.

---

## Show the real thing
	A live page, right on the slide
// web: https://cewillis.com

`// web:` with an address puts a live web page on the slide when you present: a demo, a poll, a video. Press I to use the page, and click beside it to get back to your slides. Until then, the slide shows where it goes.

---

// timer: 5:00 ring
## Five minutes for questions

	The clock starts when this slide comes up.

`// timer: 5:00` turns a slide into a countdown when you present. Add `ring` or `bar` to see the time run down, and `next` to move on at zero. `// timer: until 14:45` counts down to a time of day.

---

# Thank you
### Now ==write== yours.

Press ⌘↵ to present, or ⌘⇧↵ for Presenter view with your notes.
