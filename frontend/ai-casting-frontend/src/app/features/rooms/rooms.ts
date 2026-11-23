import { Component, DestroyRef, inject, signal } from '@angular/core';
import { LiveService } from '../../core/services/live.service';
import { RouterLink } from '@angular/router';
import { RoomItem, RoomService } from '../../core/services/room.service';

/** Mes rooms de casting : une par projet dont je fais partie, avec ce qui m'attend (cartes à swiper). */
@Component({
  selector: 'app-rooms',
  standalone: true,
  imports: [RouterLink],
  template: `
  <section class="page">
    <header><h1>Mes rooms</h1>
      <p>Chaque projet a sa room : l'équipe y swipe les candidats, suit les résultats, partage ses documents et se répartit les tâches.</p></header>
    @if (loading()) { <div class="skel"></div> }
    @else if (!rooms().length) {
      <div class="empty"><span class="ring" aria-hidden="true"></span><h2>Aucune room pour l'instant</h2>
        <p>Une room s'ouvre quand un projet de casting est lancé (à la publication de la V2). Vous y serez invité automatiquement.</p></div>
    } @else {
      <ul class="grid">
        @for (r of rooms(); track r.id; let i = $index) {
          <li [style.--d]="i"><a [routerLink]="['/rooms', r.id]">
            <span class="top"><span class="type">{{ r.type === 'PUBLICITE' ? 'Publicité' : r.type }}</span>@if (r.lead) { <span class="lead">Vous dirigez</span> }</span>
            <b>{{ r.title }}</b>
            <small>{{ r.roles }} rôle{{ r.roles > 1 ? 's' : '' }}</small>
            @if (r.toSwipe) { <span class="todo"><i aria-hidden="true"></i>{{ r.toSwipe }} carte{{ r.toSwipe > 1 ? 's' : '' }} à swiper</span> }
            @else { <span class="todo calm">À jour</span> }
          </a></li>
        }
      </ul>
    }
  </section>
  `,
  styles: [`
  :host { display: block; }
  .page { padding: 24px 32px 40px; max-width: 1060px; display: flex; flex-direction: column; gap: 18px; }
  h1 { margin: 0; font-size: 38px; font-stretch: 82%; } header p { margin: 6px 0 0; color: var(--text-muted); max-width: 64ch; }
  .grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
  .grid li { animation: in .35s cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--d) * 50ms); }
  @keyframes in { from { opacity: 0; transform: translateY(10px); } }
  a { display: flex; flex-direction: column; gap: 6px; padding: 16px; border-radius: 18px; border: 1px solid var(--border); background: var(--glass); color: var(--text-primary);
    text-decoration: none; transition: transform .2s cubic-bezier(.2,1.2,.4,1), border-color .2s, box-shadow .2s; }
  a:hover { transform: translateY(-3px); border-color: var(--accent); box-shadow: 0 14px 30px color-mix(in srgb, var(--graphite-950) 18%, transparent); }
  .top { display: flex; gap: 6px; } .type, .lead { font-size: 11.5px; font-weight: 700; padding: 3px 9px; border-radius: 999px; background: color-mix(in srgb, var(--text-subtle) 14%, transparent); color: var(--text-secondary); }
  .lead { background: var(--accent-dim); color: var(--accent-ink); }
  b { font-size: 19px; font-stretch: 82%; } small { color: var(--text-muted); font-size: 13px; }
  .todo { margin-top: 6px; display: inline-flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 700; color: var(--accent-ink); }
  .todo i { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); animation: p 1.6s ease-in-out infinite; }
  @keyframes p { 50% { opacity: .35; } }
  .todo.calm { color: var(--success); }
  .empty { padding: 36px 20px; text-align: center; border: 1px dashed var(--border); border-radius: 18px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .empty p { margin: 0; color: var(--text-muted); max-width: 52ch; }
  .ring { width: 44px; height: 44px; border-radius: 50%; border: 5px solid var(--accent); transform: rotate(-8deg) scaleX(1.1); }
  .skel { height: 140px; border-radius: 18px; background: var(--glass); }
  @media (max-width: 760px) { .page { padding: 16px 14px 24px; } h1 { font-size: 30px; } }
  `]
})
export class RoomsComponent {
  private readonly api = inject(RoomService);
  readonly rooms = signal<RoomItem[]>([]);
  readonly loading = signal(true);
  constructor() {
    this.load();
    inject(LiveService).watch(inject(DestroyRef), () => this.load());
  }
  private load(): void { this.api.mine().subscribe({ next: r => { this.rooms.set(r); this.loading.set(false); }, error: () => this.loading.set(false) }); }
}
