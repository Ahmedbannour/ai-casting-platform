import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

interface Section { id: string; h: string; p: string[]; }
interface Doc { title: string; intro: string; sections: Section[]; }

/** Version des textes (identique à ConsentService.VERSION côté serveur). */
export const LEGAL_VERSION = '2026-11-17';
export const LEGAL_VERSION_LABEL = '17 novembre 2026';

const EDITEUR = 'AI Casting — [raison sociale, adresse et numéro d’immatriculation à compléter avant le lancement]';
const CONTACT = '[adresse e-mail de contact à compléter]';

const DOCS: Record<string, Doc> = {
  conditions: {
    title: 'Conditions d’utilisation',
    intro: 'Ces conditions encadrent l’usage de la plateforme AI Casting par les agences de casting sous contrat, leurs agents et les acteurs et actrices qui y tiennent leur profil.',
    sections: [
      { id: 'objet', h: 'Objet du service', p: [
        `La plateforme est éditée par ${EDITEUR}. Elle permet aux agences de casting de rechercher des profils d’acteurs, de les présenter à des réalisateurs et de leur proposer des rôles ; elle permet aux acteurs de tenir leur profil à jour et de répondre aux propositions.`,
        'La recherche par intelligence artificielle propose des profils et explique ses choix ; la décision de retenir ou d’écarter un profil revient toujours à une personne de l’agence.' ] },
      { id: 'comptes', h: 'Comptes', p: [
        'Un acteur crée son compte lui-même (adresse e-mail et mot de passe, ou connexion avec Google ou Facebook). Les comptes des agents sont créés par l’administrateur de leur agence ; l’accès d’une agence dépend de son contrat en cours.',
        'Chacun garde ses identifiants pour lui et signale sans délai toute utilisation qu’il n’a pas faite. Après plusieurs essais de mot de passe erronés, la connexion est suspendue quelques minutes par sécurité.' ] },
      { id: 'mineurs', h: 'Acteurs mineurs', p: [
        'Un acteur de moins de 18 ans ne peut s’inscrire qu’avec l’accord de son représentant légal, dont le nom est enregistré avec la date de l’accord. Les propositions de rôle adressées à un mineur doivent passer par ce représentant.' ] },
      { id: 'engagements', h: 'Engagements des utilisateurs', p: [
        'L’acteur publie des informations exactes et des photos dont il détient les droits, sans contenu choquant ou trompeur. Il peut à tout moment mettre son profil en pause : il disparaît alors des recherches et des liens envoyés aux réalisateurs.',
        'L’agence n’utilise les profils et les coordonnées qu’à des fins de casting, dans le respect de la politique de confidentialité ; chaque consultation des coordonnées d’un acteur du vivier est enregistrée et visible de l’acteur.' ] },
      { id: 'contenus', h: 'Contenus et propriété', p: [
        'L’acteur reste propriétaire de ses photos et documents. Il autorise la plateforme à les afficher aux agences et aux réalisateurs auxquels un profil est présenté, pour la durée de son inscription.' ] },
      { id: 'responsabilite', h: 'Disponibilité et responsabilité', p: [
        'Le service est fourni avec soin mais peut être interrompu pour maintenance ou incident. AI Casting n’est pas partie aux contrats conclus entre agences, réalisateurs et acteurs.' ] },
      { id: 'fin', h: 'Suspension et suppression', p: [
        'Un compte peut être suspendu en cas d’usage contraire à ces conditions. Chacun peut demander la suppression de son compte ; les données sont alors effacées comme le prévoit la politique de confidentialité.' ] },
      { id: 'droit', h: 'Droit applicable', p: [
        'Ces conditions sont soumises au droit tunisien. En cas de modification, la nouvelle version est datée et votre accord vous est demandé à nouveau à la connexion suivante.' ] },
    ]
  },
  confidentialite: {
    title: 'Politique de confidentialité',
    intro: 'Cette politique explique quelles données personnelles la plateforme traite, pourquoi, combien de temps, et comment exercer vos droits. Elle s’appuie sur la loi organique tunisienne n° 2004-63 du 27 juillet 2004 relative à la protection des données à caractère personnel et, pour les personnes situées dans l’Union européenne, sur le RGPD.',
    sections: [
      { id: 'responsable', h: 'Responsable du traitement', p: [
        `${EDITEUR}. Contact pour toute question sur vos données : ${CONTACT}.` ] },
      { id: 'donnees', h: 'Données traitées', p: [
        'Acteurs : identité, date de naissance, ville, caractéristiques physiques, langues, compétences, expériences, disponibilités, photos et documents, coordonnées (téléphone, e-mail), réponses aux propositions, choix de visibilité.',
        'Agents et administrateurs : identité, adresse e-mail, agence, actions effectuées (journal d’audit).',
        'Connexion avec Google ou Facebook : nom, adresse e-mail et identifiant du compte, uniquement pour vous connecter. Aucun accès à vos publications, amis ou albums.',
        'Données techniques : journaux de connexion et de sécurité (dont les essais de mot de passe erronés).' ] },
      { id: 'finalites', h: 'Pourquoi et sur quelle base', p: [
        'Présenter les profils aux agences de casting et aux réalisateurs, proposer des rôles et organiser les auditions : sur la base de votre accord, donné à l’inscription et retirable à tout moment (mise en pause ou suppression du profil).',
        'Gérer les comptes, la sécurité et le contrat des agences : nécessaire au service et à nos obligations.',
        'Recherche par intelligence artificielle : le modèle d’IA tourne sur nos propres serveurs ; vos données ne sont pas envoyées à un service d’IA extérieur.' ] },
      { id: 'destinataires', h: 'Qui voit quoi', p: [
        'Un acteur apporté par une agence reste visible de cette seule agence, sauf s’il choisit de rejoindre le vivier commun. Les coordonnées d’un acteur du vivier sont masquées : une agence doit les demander, la demande est enregistrée et l’acteur la voit.',
        'Un réalisateur ne voit que les profils qu’une agence lui présente, par un lien qu’elle peut retirer. Aucune donnée n’est vendue.' ] },
      { id: 'duree', h: 'Durées de conservation', p: [
        'Profil, photos et compte : tant que le compte est actif, puis effacement à la suppression du compte. Journal d’administration et de sécurité : 12 mois. Consultations des coordonnées : 12 mois. Messages du formulaire de contact : 12 mois. Historique des recherches des agences : 12 mois. Notifications : 6 mois. Liens à usage unique (invitation, vérification, mot de passe) : 30 jours après usage ou expiration. Une purge automatique efface chaque nuit ce qui a dépassé ces durées.' ] },
      { id: 'droits', h: 'Vos droits', p: [
        'Vous pouvez accéder à vos données, les corriger, vous opposer à leur traitement, retirer votre accord, en obtenir une copie et demander leur suppression : depuis « Mon profil » (modification, mise en pause, et dans « Mes données » : téléchargement de vos données et suppression du compte) ou en écrivant à ' + CONTACT + '.',
        'Vous pouvez aussi saisir l’Instance nationale de protection des données personnelles (INPDP) en Tunisie, ou l’autorité de protection des données de votre pays.' ] },
      { id: 'securite', h: 'Sécurité', p: [
        'Mots de passe chiffrés, connexions protégées, accès limité selon le rôle, journal des actions de l’administration, limitation des essais de connexion. Les photos et documents ne s’ouvrent que par des liens signés, valables environ une heure.' ] },
      { id: 'cookies', h: 'Cookies et stockage local', p: [
        'La plateforme n’utilise ni publicité ni pistage. Elle garde dans votre navigateur le jeton de session et vos préférences d’affichage (thème, menu replié). Les boutons Google et Facebook ne sont chargés que sur la page de connexion.' ] },
      { id: 'modifs', h: 'Modifications', p: [
        'Toute nouvelle version est datée ; votre accord vous est demandé à nouveau à la connexion suivante.' ] },
    ]
  }
};

/** T-101 · Pages publiques : conditions d'utilisation et politique de confidentialité. */
@Component({
  selector: 'app-legal-page',
  standalone: true,
  imports: [RouterLink],
  template: `
  <main class="legal">
    <a class="back" routerLink="/auth/login">← AI Casting</a>
    <h1>{{ doc.title }}</h1>
    <p class="ver">Version du {{ version }} · <span class="draft">version de travail, relue par un juriste avant le lancement</span></p>
    <p class="intro">{{ doc.intro }}</p>
    <nav class="toc" aria-label="Sommaire">
      @for (s of doc.sections; track s.id) { <a [href]="'#' + s.id" (click)="go($event, s.id)">{{ s.h }}</a> }
    </nav>
    @for (s of doc.sections; track s.id) {
      <section [id]="s.id"><h2>{{ s.h }}</h2>@for (p of s.p; track $index) { <p>{{ p }}</p> }</section>
    }
    <p class="other">
      @if (key === 'conditions') { Voir aussi la <a routerLink="/legal/confidentialite">politique de confidentialité</a>. }
      @else { Voir aussi les <a routerLink="/legal/conditions">conditions d’utilisation</a>. }
    </p>
  </main>`,
  styles: [`
    :host { display: block; min-height: 100vh; background: var(--bg-primary); color: var(--text-primary); }
    .legal { max-width: 760px; margin: 0 auto; padding: 32px 22px 80px; font-size: 16px; line-height: 1.65; }
    .back { color: var(--text-muted); text-decoration: none; font-size: 14px; }
    .back:hover { color: var(--accent); }
    h1 { font-size: 36px; line-height: 1.15; margin: 18px 0 6px; }
    .ver { color: var(--text-muted); font-size: 14px; margin: 0 0 18px; }
    .draft { color: var(--accent); }
    .intro { font-size: 17px; color: var(--text-primary); }
    .toc { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0 8px; }
    .toc a { font-size: 13.5px; padding: 5px 11px; border-radius: 999px; border: 1px solid var(--border); color: var(--text-muted); text-decoration: none; }
    .toc a:hover { border-color: var(--accent); color: var(--text-primary); }
    section { margin-top: 26px; scroll-margin-top: 16px; }
    h2 { font-size: 20px; margin: 0 0 6px; }
    p { margin: 0 0 10px; }
    .other { margin-top: 34px; color: var(--text-muted); }
    a { color: var(--accent); }
    @media (max-width: 600px) { h1 { font-size: 28px; } .legal { padding: 22px 16px 60px; } }
  `]
})
export class LegalPageComponent {
  readonly key = (inject(ActivatedRoute).snapshot.data['doc'] as string) || 'conditions';
  readonly doc = DOCS[this.key];
  readonly version = LEGAL_VERSION_LABEL;
  go(e: Event, id: string): void { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}
