const HOW_TO_STEPS = [
  {
    step: "1",
    title: "Regístrate",
    icon: "https://img.icons8.com/color/96/user-male-circle.png",
    body: (
      <>
        Crea tu cuenta en{" "}
        <a
          href="https://vehiculoschocados.cl/Account/Register"
          target="_blank"
          rel="noreferrer"
          className="ui-focus font-semibold text-cyan-700 underline"
        >
          este enlace
        </a>{" "}
        y confirma tu correo electrónico.
      </>
    ),
  },
  {
    step: "2",
    title: "Constituye tu garantía",
    icon: "https://img.icons8.com/color/96/money-bag.png",
    body: (
      <>
        Para ofertar, debes constituir tu garantía. Contáctanos por{" "}
        <a
          href="https://wa.me/56989323397?text=Hola%20quiero%20información%20sobre%20la%20garantía"
          target="_blank"
          rel="noreferrer"
          className="ui-focus font-semibold text-cyan-700 underline"
        >
          WhatsApp
        </a>{" "}
        o revisa la ayuda{" "}
        <a
          href="https://vehiculoschocados.cl/Help"
          target="_blank"
          rel="noreferrer"
          className="ui-focus font-semibold text-cyan-700 underline"
        >
          aquí
        </a>
        .
      </>
    ),
  },
  {
    step: "3",
    title: "Revisa los lotes",
    icon: "https://img.icons8.com/color/96/car.png",
    body: (
      <>
        Explora los{" "}
        <a
          href="https://vehiculoschocados.cl/Listing"
          target="_blank"
          rel="noreferrer"
          className="ui-focus font-semibold text-cyan-700 underline"
        >
          vehículos disponibles
        </a>{" "}
        con fotos, videos y descripciones.
      </>
    ),
  },
  {
    step: "4",
    title: "Adjudicación y retiro",
    icon: "https://cdn-icons-png.flaticon.com/128/2162/2162183.png",
    body: (
      <>
        Escríbenos por WhatsApp para asesorarte. Si resultas adjudicatario, coordinamos pago y retiro en
        nuestras bodegas.
      </>
    ),
  },
] as const;

type ComoParticiparContentProps = {
  className?: string;
  showIntro?: boolean;
  compact?: boolean;
};

export function ComoParticiparContent({
  className = "",
  showIntro = true,
  compact = false,
}: ComoParticiparContentProps) {
  return (
    <div className={className}>
      {showIntro ? (
        <div className={compact ? "mb-2" : "mb-4 md:mb-6"}>
          <p className="premium-kicker">Cómo participar</p>
          <h2 className={`font-bold text-slate-900 ${compact ? "text-lg" : "text-xl md:text-2xl"}`}>
            ¿Cómo participar en los remates?
          </h2>
          {!compact ? (
            <p className="mt-2 text-sm text-slate-700">
              Participar en nuestras subastas online es <strong>fácil y seguro</strong>. Sigue estos pasos:
            </p>
          ) : null}
        </div>
      ) : null}
      <div className={compact ? "grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-2.5" : "howto-rail"}>
        {HOW_TO_STEPS.map((step) => (
          <div
            key={step.step}
            className={
              compact
                ? "howto-step-card rounded-lg border border-slate-200 bg-white p-2.5 text-left shadow-sm"
                : "howto-step-card h-full rounded-xl border border-slate-200 bg-white px-4 py-5 text-center shadow-sm transition duration-200 hover:-translate-y-1 hover:border-cyan-200 hover:shadow-md md:py-6"
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={step.icon}
              alt=""
              aria-hidden="true"
              className={
                compact
                  ? "mb-1.5 h-8 w-8"
                  : "mx-auto mb-3 w-[88px] max-w-full md:mb-4 md:w-[96px]"
              }
              loading="lazy"
            />
            <h3 className={`font-bold text-slate-900 ${compact ? "text-xs leading-snug" : "text-base"}`}>
              {step.step}. {step.title}
            </h3>
            <p className={`text-slate-600 ${compact ? "mt-1 text-[11px] leading-snug" : "mt-2 text-sm"}`}>
              {step.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
