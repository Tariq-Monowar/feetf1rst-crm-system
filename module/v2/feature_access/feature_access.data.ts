/**
 * Single source of truth for feature access.
 * To add a new feature:
 * 1. Add one row below (key = schema field name, must match Prisma FeatureAccess / employee_feature_access).
 * 2. Add the same column in prisma/schema.prisma to both FeatureAccess and employee_feature_access.
 * 3. Run: npx prisma generate && npx prisma db push
 * For items with sub-menus (e.g. Einstellungen), add optional `nested: [{ title, path }, ...]`.
 */
export type FeatureItem = {
  key: string;
  title: string;
  path: string;
  nested?: { title: string; path: string }[];
};

export const FEATURES: FeatureItem[] = [
  { key: "dashboard", title: "Dashboard", path: "/dashboard" },
  { key: "teamchat", title: "Teamchat", path: "/dashboard/teamchat" },
  { key: "kundensuche", title: "Kundensuche", path: "/dashboard/customers" },
  { key: "neukundenerstellung", title: "Neukundenerstellung", path: "/dashboard/neukundenerstellung" },
  { key: "einlagenauftrage", title: "Einlagenaufträge", path: "/dashboard/orders" },
  { key: "massschuhauftrage", title: "Maßschuhaufträge", path: "/dashboard/massschuhauftraege" },
  { key: "massschafte", title: "Maßschäfte", path: "/dashboard/custom-shafts" },
  { key: "produktverwaltung", title: "Produktverwaltung", path: "/dashboard/lager" },
  { key: "sammelbestellungen", title: "Sammelbestellungen", path: "/dashboard/group-orders" },
  { key: "nachrichten", title: "Nachrichten", path: "/dashboard/email/inbox" },
  { key: "terminkalender", title: "Terminkalender", path: "/dashboard/calendar" },
  { key: "monatsstatistik", title: "Monatsstatistik", path: "/dashboard/monatsstatistik" },
  { key: "mitarbeitercontrolling", title: "Mitarbeitercontrolling", path: "/dashboard/mitarbeitercontrolling" },
  { key: "einlagencontrolling", title: "Einlagencontrolling", path: "/dashboard/einlagencontrolling" },
  { key: "fusubungen", title: "Fußübungen", path: "/dashboard/foot-exercises" },
  { key: "musterzettel", title: "Musterzettel", path: "/dashboard/musterzettel" },
  {
    key: "einstellungen",
    title: "Einstellungen",
    path: "/dashboard/settings",
    nested: [
      { title: "Grundeinstellungen", path: "/dashboard/settings-profile" },
      { title: "Backup Einstellungen", path: "/dashboard/settings-profile/backup" },
      { title: "Kundenkommunikation", path: "/dashboard/settings-profile/communication" },
      { title: "Werkstattzettel", path: "/dashboard/settings-profile/werkstattzettel" },
      { title: "Benachrichtigungen", path: "/dashboard/settings-profile/benachrichtigungen" },
      { title: "Lagereinstellungen", path: "/dashboard/settings-profile/notifications" },
      { title: "Preisverwaltung", path: "/dashboard/settings-profile/preisverwaltung" },
      { title: "Software Scanstation", path: "/dashboard/settings-profile/software-scanstation" },
      { title: "Design & Logo", path: "/dashboard/settings-profile/design" },
      { title: "Passwort ändern", path: "/dashboard/settings-profile/changes-password" },
      { title: "Sprache", path: "/dashboard/settings-profile/sprache" },
      { title: "Fragen", path: "/dashboard/settings-profile/fragen" },
      { title: "Automatische Orders", path: "/dashboard/settings-profile/automatische-orders" },
    ],
  },
  { key: "account_settings", title: "Account Settings", path: "/dashboard/account-settings" },
  { key: "news_and_aktuelles", title: "News & Aktuelles", path: "/dashboard/news" },
  { key: "produktkatalog", title: "Produktkatalog", path: "/dashboard/products" },
  { key: "balance", title: "Balance", path: "/dashboard/balance-dashboard" },
  { key: "automatisierte_nachrichten", title: "Automatisierte Nachrichten", path: "/dashboard/automatisierte-nachrichten" },
  { key: "kasse_and_abholungen", title: "Kasse & Abholungen", path: "/dashboard/kasse" },
  { key: "finanzen_and_kasse", title: "Finanzen & Kasse", path: "/dashboard/finanzen-kasse" },
  { key: "einnahmen_and_rechnungen", title: "Einnahmen & Rechnungen", path: "/dashboard/einnahmen" },
  { key: "statistiken", title: "Statistiken", path: "/dashboard/statistiken" },
  { key: "warenwirtschaft", title: "Warenwirtschaft", path: "/dashboard/warenwirtschaft" },
  { key: "leistenerstellung", title: "Leistenerstellung", path: "/dashboard/digitale-leistenerstellung" },
  { key: "crmConnection", title: "CRM Connection", path: "/dashboard/crm-cunnection" },
];

/** Legacy format for consumers that expect { title, action, path, nested }. */
export const featureAccessData = FEATURES.map((f) => ({
  title: f.title,
  action: true,
  path: f.path,
  nested: (f.nested ?? []).map((n) => ({ ...n, action: true })),
}));
