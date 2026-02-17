export default function ImpressumPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Impressum</h1>
      <div className="mt-8 space-y-5 rounded-3xl bg-white/95 p-8 shadow-soft text-slate-700">
        <p>
          Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV:
          <br />
          Maro Goth
          <br />
          Haldenweg 3
          <br />
          79853 Lenzkirch
          <br />
          Deutschland
          <br />
          E-Mail: info@gothlab.dev
        </p>

        <p>Vertreten durch die gesetzliche Vertreterin (Mutter).</p>

        <p>
          Hinweis:
          <br />
          TrustLens Project ist ein nicht-kommerzielles Informations- und Forschungsprojekt zur Analyse und Bewertung potenzieller Online-Risiken. Es werden keine kostenpflichtigen Leistungen angeboten.
        </p>
      </div>
    </main>
  );
}