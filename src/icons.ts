const svg = (d: string) => `<svg viewBox="0 0 20 20" aria-hidden="true">${d}</svg>`;

export const icons = {
  menu: svg('<path d="M3.5 6h13M3.5 10h13M3.5 14h13"/>'),
  play: svg('<path d="M6.5 4.2v11.6L16 10z" class="fill"/>'),
  presenter: svg('<rect x="2.5" y="4" width="9" height="7" rx="1"/><path d="M14 6.5h3.5M14 9.5h3.5M2.5 14.5h15"/>'),
  theme: svg('<circle cx="10" cy="10" r="6.5"/><path d="M10 3.5v13" /><path d="M10 3.5a6.5 6.5 0 0 1 0 13z" class="fill"/>'),
  close: svg('<path d="M5 5l10 10M15 5 5 15"/>'),
  open: svg('<path d="M3 6.5V15a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-6L8.3 5H4a1 1 0 0 0-1 1.5z"/>'),
  save: svg('<path d="M10 3.5v9M6.5 9 10 12.5 13.5 9M4 16h12"/>'),
  file: svg('<path d="M5.5 3h6l3 3v10.5a.5.5 0 0 1-.5.5h-8.5a.5.5 0 0 1-.5-.5V3.5a.5.5 0 0 1 .5-.5z"/><path d="M11.5 3v3h3"/>'),
  print: svg('<path d="M6 7V3.5h8V7M6 13H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-2"/><path d="M6 11h8v5.5H6z"/>'),
  share: svg('<path d="M8.5 11.5a3.2 3.2 0 0 0 4.6.1l2.5-2.5a3.2 3.2 0 0 0-4.6-4.6L9.8 5.7"/><path d="M11.5 8.5a3.2 3.2 0 0 0-4.6-.1L4.4 10.9a3.2 3.2 0 0 0 4.6 4.6l1.2-1.2"/>'),
  // Phosphor "trash-simple" (regular), MIT — a filled 256-unit glyph, unlike the stroked icons above
  trash: '<svg viewBox="0 0 256 256" aria-hidden="true" class="ph"><path d="M216,48H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM192,208H64V64H192ZM80,24a8,8,0,0,1,8-8h80a8,8,0,0,1,0,16H88A8,8,0,0,1,80,24Z"/></svg>',
  help: svg('<circle cx="10" cy="10" r="7"/><path d="M8 8a2 2 0 1 1 2.7 1.9c-.5.2-.7.6-.7 1.1v.5M10 13.8v.2"/>'),
};
