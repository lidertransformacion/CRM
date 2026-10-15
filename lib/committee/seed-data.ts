import type { CommitteeDoc, Pendiente, PendienteStatus, Punto, Topic } from "@/lib/committee/types";

const CALENDAR = [
  { number: 1, heldOn: "2026-09-01" },
  { number: 2, heldOn: "2026-09-07" },
  { number: 3, heldOn: "2026-09-14" },
  { number: 4, heldOn: "2026-09-21" },
  { number: 5, heldOn: "2026-09-28" },
  { number: 6, heldOn: "2026-10-05" },
  { number: 7, heldOn: "2026-10-14" },
];

const CURRENT = 7;

type Item = {
  title: string;
  status: PendienteStatus;
  owners?: string[];
  due?: string | null;
  born: number;
  here?: boolean;
};

function item(title: string, status: PendienteStatus, born: number, owners: string[] = [], due: string | null = null, here = false): Item {
  return { title, status, owners, due, born, here };
}

function pendiente(topicNumber: number, puntoIndex: number, index: number, raw: Item): Pendiente {
  const bornOn = CALENDAR.find((entry) => entry.number === raw.born)?.heldOn;
  if (!bornOn) throw new Error(`Missing calendar ${raw.born}`);
  return {
    id: `t${topicNumber}-p${puntoIndex}-i${index}`,
    title: raw.title,
    status: raw.status,
    owners: raw.owners ?? [],
    dueOn: raw.due ?? null,
    bornCommitteeNumber: raw.born,
    bornOn,
    closedInCommitteeNumber: raw.here ? CURRENT : null,
    leadImportKey: null,
  };
}

function punto(
  topicNumber: number,
  index: number,
  title: string,
  items: Item[],
  extra: Partial<Pick<Punto, "subtitle" | "context" | "acta" | "links">> = {},
): Punto {
  return {
    id: `t${topicNumber}-p${index}`,
    title,
    subtitle: extra.subtitle ?? "",
    context: extra.context ?? "",
    acta: extra.acta ?? null,
    links: extra.links ?? [],
    leadImportKey: null,
    pendientes: items.map((raw, itemIndex) => pendiente(topicNumber, index, itemIndex + 1, raw)),
  };
}

function topic(
  number: number,
  title: string,
  minutes: number | null,
  tags: string[],
  context: string,
  puntos: Punto[],
): Topic {
  return { id: `topic-${number}`, number, title, context, minutes, tags, decisions: [], puntos };
}

const c = "cerrado" as const;
const e = "en_curso" as const;
const p = "pendiente" as const;

export function buildSeedCommittee(): CommitteeDoc {
  const topics: Topic[] = [
    topic(1, "Aprendizajes del equipo", 7, ["Operaciones"], "Retro rápida — no buscamos culpables, buscamos qué cambia de aquí en adelante.", [
      punto(1, 1, "Roles de equipo", [
        item("Compartir organigrama del equipo + rol de Paula", c, 1, ["Andre"], "2026-09-07"),
        item("Reunión con área contable para acuerdos operativos del día a día", c, 1, ["Andre"], "2026-09-07"),
      ], {
        acta: "Andrea - Compartir organigrama de equipo. para division de tipos de clientes. Compartir hoy con el acta + rol de Paula\nOrganizar reunion con el área conta ble para socializar y tener nuevos acuerdos en cosas operativas del día a día.",
      }),
    ]),
    topic(2, "Mercado Libre — Apertura Medellín y Bogotá", 9, ["Operaciones", "Logística", "IT"], "Socializar la apertura de los 2 puntos. Meta de apertura: octubre.", [
      punto(2, 1, "MELI - apertura MEDELLIN lunes 26 octubre", [
        item("Validar fecha de apertura Medellín (24 oct)", c, 1, ["Juanpa"], "2026-09-28"),
        item("Definir logo del punto", c, 1, ["Diego"], "2026-10-09", true),
        item("Validar conexión de router y datáfonos por red (sin SIM card)", c, 1, ["Juanpa"], "2026-09-28"),
        item("creación del establecimiento en CC (Gantt + capex + dirección)", c, 1, ["Juanpa"], "2026-10-07"),
        item("Validar con MELI el día de visita de Culligan (agua + tomas)", c, 1, ["Diego"], "2026-10-09", true),
        item("Venta de filtrados PARA AMBOS", e, 6, ["Juanpa"], "2026-10-12"),
        item("Compra de molinos y metodos para preparacion", e, 7, ["Juanpa"], "2026-10-21"),
      ], {
        subtitle: "Fechas y responsables por hito de cada punto.",
        context: "Medellín abre a finales de octubre (24). Planos finales en nuestro poder. Equipos: OK por parte de expansión. Ingreso del 21 al 24",
        acta: "Medellin abre a finales de Octubre (24) valdiar fecha\nPlanos finales en nuestro poder.\nPdte definición de logo.\nEquipos: Ok por parte de expansíón.\nValidar conexión de ROUTER y revisar conexión de datafonos para no usar SIM CARD. Usar un datafono que funcione por red\n- Mapa pdte creación establecimiento en CC (con Gantt + capex + direccion)\n- Enviar a Osmi misma info para creación de POS.\n- Validar con MELI que día pueden hacer visitas los de culligan (con agua + tomas)",
      }),
      punto(2, 2, "Aclaraciones de operación pendientes", [
        item("Aclaraciones de operación pendientes", c, 1, ["Andre", "Juanpa"], "2026-09-03"),
      ], {
        subtitle: "Puntos operativos que aún no están claros con el equipo.",
        context: "1. Bunn de la planta queda libre para explorar si puede pasar a la barra (sin termos) 2. cuadrar visita a Conecta (mañana) 3. Equipos de barra: no hay toca comprarlos- se podría alquilar mientras llegan las Simonelli. Juanpa está revisando con proveedores. 4.Utensilios de cocina: Juanpa está esperando el flujo de plata. Para comprar. 5. Verificar como funcionaría el internet del punto 6. Logo instalado 7.Definir fecha de INGRESO DE EQUIPOS",
        acta: "1. Bunn de la planta queda libre para explorar si puede pasar a la barra (sin termos)\n2. cuadrar visita a Conecta (mañana)\n3. Equipos de barra: no hay toca comprarlos- se podría alquilar mientras llegan las Simonelli. Juanpa está revisando con proveedores.\n4.Utensilios de cocina: Juanpa está esperando el flujo de plata. Para comprar.\n5. Verificar como funcionaría el internet del punto\n6. Logo instalado\n7.Definir fecha de INGRESO DE EQUIPOS",
      }),
      punto(2, 3, "Ajuste de oferta y pricing", [
        item("Ajuste de oferta y pricing", c, 1, ["Andre", "Maria I"], "2026-09-07"),
      ], {
        subtitle: "Definir oferta y precios para los dos puntos nuevos.",
        context: "1. Pdte OK finanzas ajuste precios 2. Agendar reunión con equipo contable + Osmar para apertura de mercado libre",
        acta: "1. Pdte OK finanzas ajuste precios\n2. Agendar reunión con equipo contable + Osmar para apertura de mercado libre",
      }),
      punto(2, 4, "Contrataciones (meli + WeWork)", [
        item("Iniciar contratación Medellín (2 personas + rol líder)", e, 2, ["Daniel"], "2026-10-19"),
        item("Contratar 2 personas para WeWork", c, 2, ["Daniel"], "2026-10-19", true),
        item("Contratación líder de barras OOS-MDE", e, 2, ["Daniel"], "2026-10-19"),
      ], {
        context: "Por ahora dos personas para Medellín y dos más para WeWork. Debe haber un rol de líder para este formato.",
        acta: "Inicia contratación para Medellín debe haber un rol de lider para esete formato. Por ahora dos personas.\nSe suman dos personas mas para wework\nDefinir si se necesita una contratación APARTE para un lider de barras OOS-MDE",
      }),
      punto(2, 5, "INSTALACIÓN BIOMETRICOS", [
        item("Revisar con financiera el adicional de instalación (aprobado por Andrea)", c, 3, ["Andre"], "2026-09-21"),
        item("Validar con MELI la instalación del biométrico (bloqueos de red)", c, 3, ["Juanpa"], "2026-09-21"),
        item("Enviar correo para validar con el área IT de MELI", c, 3, ["Osmar"], "2026-09-21"),
      ], {
        context: "Todas estas tiendas manejarán biométrico, no app BUK.",
        acta: "TODAS ESTAS TIENDAS EMPEZARAN A MANEJAR BIOMETRICO Y NO APP BUK!\n1. Revisar ocn financiera el adicional de instalación -APROBADO POR ANDREA\n2. Validar con mercado libre la instalacion de biometrico para efectos de bloqueos de red\n3.Osmar envía correo apra validar con el area IT meli",
      }),
      punto(2, 6, "Varios operación Meli", [
        item("Solicitar QRs para ambas barras", e, 5, ["Maria I", "Daniel"], "2026-10-21"),
        item("Parametrizar subsidio (este mes el registro de redenciones queda en Google Sheets)", e, 5, ["Andre", "Osmar"], "2026-10-14"),
        item("Exhibiciones (no hay fecha)", e, 6, ["Catery"], "2026-10-16"),
      ], {
        context: "QRs - Pdte firma para la entrega Parametrizacion que da en sistema con valor cero y solo se vera el conteo de bebidas subsidiadas Para este viernes quedarian guias de layout para las exhibiciones en las barras + activacion del vaso rehuso",
        acta: "-Solicitud de QRs para ambas barras\n-Parametrización subsidio : Aún está pendiente. En un google sheets queda el registro de las redenciones de este mes",
      }),
    ]),
    topic(3, "Bavaria", 5, ["Mercadeo", "Finanzas", "Logística"], "Status de ventas del punto y necesidad de renovar.", [
      punto(3, 1, "ADECUACIONES (cotizaciones)", [
        item("Nuevo arreglo de sillas (se están dañando otra vez)", e, 1, ["Juanpa"], "2026-10-24"),
        item("Sofá y lámparas: pendiente OC para plan de pagos", e, 1, ["Juanpa", "Diego"], "2026-10-24"),
        item("Journey: piezas de mercadeo (pantallas / exhibición café)", c, 1, ["Maria Paula"], "2026-10-08", true),
      ], {
        subtitle: "Sillas, lámparas y mueble de exhibición en sitio.",
        context: "Presupuesto para adecuaciones: 10 millones (estimado). Siempre que se hagan arreglos, enviar foto.",
        acta: "1. Arreglos sillas: ya quedaron. otra vez se están dañando. Hay contemplado otro arreglo de sillas.\n2.Incluir sofa (depende de pagos de proveedores) y lamparas - Pdte OC para proceder al plan de pagos\n\nSiempre que se hagan arreglos enviar foto para evitar que no quedemos conformes.\n3.ppto para adecuaciones: 10 millones (Estimado)\n3. Journey - piezas en manos de mercadeo (pantallas/ exhibición café) - Entrega hoy 14 septiembre.",
      }),
      punto(3, 2, "Gift cards", [
        item("Solicitar datáfonos Credibanco para redención de gift cards", e, 2, ["Maria I"], "2026-10-28"),
        item("Enviar 50+ gift cards a la oficina", c, 2, ["Osmar", "Daniel"], "2026-10-19"),
      ], {
        acta: "Pdte gift cards para redención. Se deben solicitar los datafonos credibanco\nHoy se envían 50+ a la oficina.",
      }),
      punto(3, 3, "Desarrollo vasos 12 0z", [
        item("Revisar con KOS dispo y minimos", p, 6, ["Maria Paula"], "2026-10-19"),
        item("Desarrollo de receta y ver con cuales bebidas se va a hacer el desarrollo", p, 7, ["Daniel", "Catery", "Maria Paula"], "2026-11-02"),
      ], {
        context: "Definir plan de trabajo - Vamos a hacer piloto en Bavaria de este tamaño Proximo comité revisamos avances sobre este tema.",
      }),
      punto(3, 4, "Experiencia en punto de venta", [
        item("Revisión interna Pau y Andre", p, 6, ["Maria Paula"], "2026-10-19"),
      ], {
        context: "Varias quejas por parte del cliente en terminos de la experiencia del sitio, el portafolio.",
      }),
    ]),
    topic(4, "Transición operativa — tiendas del canal a Daniel Esteban", 6, ["Operaciones"], "La operación de las tiendas del canal pasa a Daniel Esteban. El relacionamiento y la negociación con el cliente los sigue manejando el canal OOS. El cumplimiento de presupuesto es compartido entre ambos frentes.", [
      punto(4, 1, "Entrega de la operación", [
        item("Entrega de la operación", c, 1, ["Andre"], "2026-09-03"),
      ], {
        subtitle: "Pendiente: entregar el status de la operación y del equipo a Daniel, y terminar de definir el protocolo de coordinación entre ambos.",
        context: "1-Entregar equipo y ppto de ventas por punto 2- Compromisos actuales que hicimos 3-",
        acta: "1-Entregar equipo y ppto de ventas por punto\n2- Compromisos actuales que hicimos\n3-",
      }),
    ]),
    topic(5, "Nuevos clientes — pipeline", 12, ["Mercadeo", "Finanzas", "Logística"], "Nuevas aperturas en pipeline, con foco en hotelería.", [
      punto(5, 1, "COPERAMA", [
        item("Máquinas CINO (700 uds)", e, 1, ["Maria I"], "2026-10-19"),
        item("Status de leasings (jura queda esta semana)", e, 1, ["Maria I"], "2026-10-05"),
        item("Cápsulas decaf: avisar a Planta con una semana de anticipación", e, 1, ["Diana"], null),
        item("Revisar calidades del perfil de cápsulas", p, 1, ["Diana"], "2026-10-05"),
        item("Cotizar máquinas espresso (usadas y nuevas)", p, 1, ["Juanpa"], "2026-10-26"),
        item("Costeo + pricing de capsulas descafeinadas", p, 7, ["Maria Paula", "Diana"], "2026-10-19"),
      ], {
        subtitle: "Para Hotel Sheraton y Grupo BH — necesaria para poder abrir con ellos.",
        context: "Cerrados 6 hoteles (5 Bogotá + 1 Medellín). Compra de máquinas a CINO: 700 uds. Leasing: cupo de 200 millones para equipos; si hay leasing suma 3 semanas.",
        acta: "Compra de las maquinas a CINO - 700 UDS.Cotizaciones en manos de Maria I.\n\n- Status leasings\n- Cerrados 6 hoteles (5 Bog + 1 medellin)\n- Capsulas decaf - avisar una semana anticipación a Planta.\n-Revisión calidades del perifl de capsulas.\n-Leasing; cupo 200 millones para equipos.\n- Maquinas espresso: En cotizaciones (van maquinas usadas y nuevas) - tener en cuenta que si hay leasing suma 3 semanas.",
        links: [{ id: "link-coperama", label: "Cronograma implementación BH", url: "" }],
      }),
      punto(5, 2, "Leasing equipos", [
        item("Leasing equipos", c, 1, ["Finanzas"], null),
      ], {
        context: "Frenados los leasings. Hasta nuevo aviso. Si hay emergencia se compra la maquina por separado Pdte de arte de Andrea enviar cotización actualizada.",
        acta: "Frenados los leasings. Hasta nuevo aviso.\nSi hay emergencia se compra la maquina por separado\nPdte de arte de Andrea enviar cotización actualizada.",
      }),
      punto(5, 3, "Barra wework Medellin", [
        item("Definir Gantt para apertura del 26 oct", c, 5, ["Juanpa"], "2026-10-05", true),
        item("Costear adecuaciones y armar modelo (con financiera)", p, 5, ["Andre"], "2026-10-05"),
        item("Expansión define capacidad de equipos", e, 5, ["Juanpa", "Diego"], "2026-10-05"),
        item("Fabricación vitrinas refrigeradas (reunion para definir esta semana)", c, 6, ["Diego"], "2026-10-09", true),
        item("Creación/contrato/resolución", p, 7, ["Mapa"], "2026-10-19"),
        item("Espacio bodegaje + lockers", p, 7, ["Daniel", "Juanpa"], "2026-10-19"),
      ], {
        context: "Vitrinas OK we work deja meter a refrigerada P",
        acta: "Definir Gantt para apertura 26 Octubre\nDe acuerdo a la visita, en terminos de adecuaciones definir costos y hacer modelo (Andre + financiera)\nExpansiones define que capacidad de equipos da para aterrizar.",
      }),
    ]),
    topic(6, "SURA", 15, ["Operaciones", "Finanzas", "Logística"], "Líder contable presente para el tema de facturación.", [
      punto(6, 1, "Facturación refrigerios", [
        item("Revisar si se incluye la facturación del 31 en este mes", c, 1, ["Osmar"], "2026-09-15"),
        item("Enviar redención de desayunos no marcados en POS", c, 1, ["Osmar"], "2026-09-15"),
        item("Revisar si se puede facturar el 25 de cada mes", c, 1, ["Andre"], "2026-09-15"),
      ], {
        subtitle: "Con Contabilidad — líder contable presente.",
        acta: "Revisar si e incluye facturacion del 31 en este mes.\nEnviar redencion de desayunos que no se han marcado en POS. Para entender que se registra hasta antes de la configuración.\n\nAndre debe revisar si se puede facturar el 25 de cada mes.",
      }),
      punto(6, 2, "Operación domingos y festivos", [
        item("Definir: entrega de hatsu + galleta en punto vs. abrir domingos y festivos", c, 1, ["Daniel", "Andre"], null),
        item("Agendar espacio con operaciones barras OOS", c, 1, ["Daniel", "Andre"], "2026-10-07", true),
      ], {
        context: "Opción: hacer piloto y escalar después.",
        acta: "Definir si sigue quedando la entrega de hatsu + galleta en punto O si se abre domingos y festivos.\nPodríamos hacer piloto + adelante.\nAgendar esapcio esta semana operaciones barras OOS.",
      }),
      punto(6, 3, "Entrega punto finalizado", [
        item("Entrega del punto finalizado (2 nov)", p, 3, ["Juanpa", "Diego"], "2026-11-02"),
      ], {
        context: "Obra ya está adentro.AHORA SI!",
        acta: "Fecha de entrega 2 de Noviembre.\nYa están adentro los de Obra.",
      }),
      punto(6, 4, "PORTAFOLIO APERTURA", [
        item("Revisar portafolio final (Sura + otras barras)", c, 5, ["Catery"], "2026-11-02", true),
        item("Incluir a Sura en la prueba de productos (socialización)", e, 5, ["Catery"], "2026-11-02"),
        item("Ruta en puntos para ver portafolio + exhibición", e, 5, ["Catery"], "2026-11-05"),
        item("MENU SURA (MEDIDAS Y ACTUALIZACION)", p, 7, ["Catery"], null),
      ], {
        context: "Prioridad: huevos y estandarización. No van filtrados para Sura. bROWNIES MERCARI/CAKES MYRIAM CAMHI",
        acta: "Revisar portafolio final (Sura + otra barras)\nPrioridad: huevos y estandarización.\nIncluir a Sura en la prueba de productos. a manera de SOCIALIZACIÓN.\nPdte ruta en puntos para ver portafolio + exhibición\nNO VAN FILTRADOS PARA SURA.",
      }),
    ]),
    topic(7, "Nuevas Tiendas OOS", 5, [], "", [
      punto(7, 1, "Don Eloy", [
        item("", c, 6, ["Juanpa"], "2026-10-09", true),
      ], { context: "Apertura de café en su nueva tienda en los anticuarios." }),
      punto(7, 2, "Tienda Fabletics", [
        item("Reunión con equipo de diseño y arquitectura (ellos nos pasan agenda)", c, 6, ["Diego"], null, true),
      ], { context: "Apertura en Mall Plaza Barranquilla. En colaboración . para febrero 2027" }),
      punto(7, 3, "NH Cartagena", [
        item("DECIDIR", p, 6, ["Andre"], null),
      ], { context: "Operación en primer piso y carrito movil en la terraza. Hacer experiencias y proveeduría de café. No hay espacio para barra." }),
      punto(7, 4, "Falabella parque Colina", [
        item("Definición fecha de apertura", p, 6, [], null),
        item("Definir modelo de inversion/negociación", p, 7, ["Maria I", "Andre"], "2026-10-19"),
      ], { context: "Piloto en punto parque la colina Se estima enero porque en un mes no da para hacerlo desde cero No se puede avanzar hasta revisar el modelo financiero" }),
      punto(7, 5, "Don Eloy", [
        item("", p, 7, [], null),
      ], { context: "A la espera de su respuesta" }),
    ]),
    topic(8, "INNOVACIÓN", 5, [], "", [
      punto(8, 1, "Nuevos cold brew RTD / Jugos naranja", [
        item("Lanzamiento estimado", p, 6, ["Catery"], null),
      ], { context: "Primera semana de diciembre lanzamiento de los cold brew Jugos es fase 2" }),
      punto(8, 2, "Café con adaptógenos", [
        item("Pdte viabilidad del producto", p, 6, [], null),
      ], { context: "Fecha de lanzamiento- Las pruebas no salieron tan bien. El café estaba quemado" }),
    ]),
    topic(9, "Otros temas", 5, [], "Parking lot — cualquier tema que salga y no estaba en la agenda.", [
      punto(9, 1, "Alquiler bodega", [
        item("Cotizar adecuaciones bodega 122 (pensando en crecer con supply chain)", c, 1, ["Juanpa"], "2026-10-09", true),
      ], {
        context: "Será algunos de los espacios de las nuevas tiendas (116 o 134)",
        acta: "Revisar otros candidatos de bodega\nSE DECIDE DIVIDIR LA BODEGA DE LA 122. Juanpa cotiza las adecuaciones teniendo en cuenta que pronto seguro necesitaremos algo mas grande a futuro con la nueva persona de supply chain.",
      }),
      punto(9, 2, "BIOMETRICOS PUNTOS", [
        item("Enviar correos solicitando biométricos a los puntos existentes", c, 5, ["Andre", "Daniela"], "2026-10-05"),
      ], { acta: "Enviar correos solicitando Biométricos a los punto YA EXISTENTES." }),
      punto(9, 3, "FINANZAS", [
        item("Definir proceso para inputs de operación", c, 5, ["Maria I"], "2026-10-05"),
      ], { acta: "Definición de proceso para imputs de operacion" }),
      punto(9, 4, "Definición experiencia filtrados en tiendas OOS", [
        item("Definir modelo/ inversion", p, 6, ["Juanpa"], "2026-10-06"),
      ], { context: "Conservar esencia de la experiencia de marca en las tiendas" }),
      punto(9, 5, "Nuevo punto", [], {}),
    ]),
  ];

  return {
    committee: {
      number: CURRENT,
      title: "Comité Out of Stores",
      area: "LIBERTARIO HOSPITALITY",
      heldOn: "2026-10-14",
      signatureName: "Andrea",
    },
    calendar: CALENDAR,
    topics,
    people: [
      ["Juanpa", false],
      ["Catery", false],
      ["Daniel", false],
      ["Maria I", false],
      ["Andre", false],
      ["Maria Paula", false],
      ["Diego", false],
      ["Diana", false],
      ["Osmar", false],
      ["Mapa", false],
      ["Finanzas", true],
      ["Daniela", true],
    ].map(([name, custom], index) => ({ name: name as string, sortOrder: index + 1, custom: custom as boolean })),
  };
}
