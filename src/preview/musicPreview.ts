import { GENRE_IDS, GENRE_PROFILES } from '../audio/genreProfiles.js';
import type { GenreId } from '../audio/genreProfiles.js';
import { MusicDirector } from '../audio/musicDirector.js';
import { barPatternFor, freqForGenreDegree, layersForGenre, songProfileFor } from '../audio/genrePatterns.js';
import { STEPS_PER_BAR } from '../audio/musicConstants.js';

function el<T extends Element>(id: string): T { return document.getElementById(id) as unknown as T; }
function readGenre(): GenreId { const v = el<HTMLSelectElement>('pv-genre').value; return (GENRE_IDS as readonly string[]).includes(v) ? (v as GenreId) : 'electronic'; }
function readSeed(): number { const v = Number(el<HTMLInputElement>('pv-seed').value); return Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 11; }
function readIntensity(): number { const v = Number(el<HTMLInputElement>('pv-intensity').value); return Math.max(0, Math.min(1, v)); }
function fillPreset(genre: GenreId): void {
  const sel = el<HTMLSelectElement>('pv-preset'); sel.replaceChildren();
  const opt0 = document.createElement('option'); opt0.value = ''; opt0.textContent = '— manual —'; sel.appendChild(opt0);
  for (const s of GENRE_PROFILES[genre].seeds) { const o = document.createElement('option'); o.value = String(s); o.textContent = 'semilla ' + s; sel.appendChild(o); }
}
function showNote(genre: GenreId, seed: number, intensity: number): void {
  const pattern = barPatternFor(genre, seed, 0);
  const profile = GENRE_PROFILES[genre];
  const song = songProfileFor(genre, seed);
  const layers = layersForGenre(profile, intensity);
  const note = pattern.arpeggio[0];
  const freq = note ? freqForGenreDegree(profile, song.tonicOffset, note.degree) : 0;
  el<HTMLOutputElement>('pv-note').textContent = note ? ('♪ ' + Math.round(freq) + ' Hz (grado ' + note.degree + (layers.arpeggio ? ' · arp ON' : ' · arp OFF') + ')') : '—';
  const bpm = Math.round(profile.bpmMin + (profile.bpmMax - profile.bpmMin) * intensity);
  el<HTMLPreElement>('pv-meta').textContent = 'genere=' + genre + ' semilla=' + seed + ' intensidad=' + intensity.toFixed(2) + ' BPM~' + bpm + ' capas=' + JSON.stringify(layers) + ' acorde=' + pattern.chord.join(',') + ' ' + STEPS_PER_BAR + ' pasos/compás';
}
function main(): void {
  const director = new MusicDirector({ initialGenre: 'electronic' });
  fillPreset('electronic');
  const play = (): void => { const g = readGenre(); const s = readSeed(); const i = readIntensity(); director.unlock(); director.enable(); director.setGenre(g, s); director.start(s); director.setIntensity(i); showNote(g, s, i); };
  const stop = (): void => { director.stop(); };
  el<HTMLSelectElement>('pv-genre').addEventListener('change', () => { fillPreset(readGenre()); showNote(readGenre(), readSeed(), readIntensity()); });
  el<HTMLSelectElement>('pv-preset').addEventListener('change', (e: Event) => { const v = (e.target as HTMLSelectElement).value; if (v) el<HTMLInputElement>('pv-seed').value = v; showNote(readGenre(), readSeed(), readIntensity()); });
  el<HTMLInputElement>('pv-intensity').addEventListener('input', () => { el<HTMLSpanElement>('pv-int-val').textContent = readIntensity().toFixed(2); director.setIntensity(readIntensity()); showNote(readGenre(), readSeed(), readIntensity()); });
  el<HTMLButtonElement>('pv-play').addEventListener('click', play);
  el<HTMLButtonElement>('pv-stop').addEventListener('click', stop);
  window.addEventListener('pagehide', () => { director.dispose(); });
}
main();
