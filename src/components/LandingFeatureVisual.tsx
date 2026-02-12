export type LandingFeatureVisualKind = 'browse' | 'clean' | 'tokens' | 'diff'

interface LandingFeatureVisualProps {
  kind: LandingFeatureVisualKind
}

function BrowseVisual() {
  return (
    <svg className="feature-visual-svg" viewBox="0 0 320 188" role="presentation" focusable="false">
      <rect x="5" y="5" width="310" height="178" rx="16" fill="#f7f1eb" stroke="#d9cec2" />
      <rect x="15" y="15" width="290" height="14" rx="7" fill="#e9ddd0" />
      <circle cx="25" cy="22" r="2.4" fill="#b31b1b" />
      <circle cx="33" cy="22" r="2.4" fill="#d97706" />
      <circle cx="41" cy="22" r="2.4" fill="#8b5e34" />

      <rect x="15" y="36" width="84" height="137" rx="9" fill="#efe4d8" />
      <rect x="24" y="47" width="60" height="10" rx="5" fill="#d8c4ae" />
      <rect x="24" y="63" width="65" height="8" rx="4" fill="#e2d1bf" />
      <rect x="24" y="76" width="52" height="8" rx="4" fill="#e2d1bf" />
      <rect x="24" y="89" width="68" height="8" rx="4" fill="#e2d1bf" />
      <rect x="24" y="102" width="58" height="8" rx="4" fill="#d2b18d" />
      <rect x="24" y="115" width="61" height="8" rx="4" fill="#e2d1bf" />
      <rect x="24" y="128" width="54" height="8" rx="4" fill="#e2d1bf" />

      <rect x="106" y="36" width="199" height="137" rx="9" fill="#fffaf5" />
      <rect x="118" y="49" width="88" height="9" rx="4.5" fill="#cab9a6" />
      <rect x="118" y="64" width="58" height="7" rx="3.5" fill="#e1d4c6" />
      <rect x="118" y="76" width="130" height="7" rx="3.5" fill="#d2b18d" />
      <rect x="118" y="88" width="170" height="7" rx="3.5" fill="#e1d4c6" />
      <rect x="118" y="100" width="152" height="7" rx="3.5" fill="#e1d4c6" />
      <rect x="118" y="112" width="164" height="7" rx="3.5" fill="#e1d4c6" />
      <rect x="118" y="124" width="123" height="7" rx="3.5" fill="#d2b18d" />
      <rect x="118" y="136" width="145" height="7" rx="3.5" fill="#e1d4c6" />
      <rect x="118" y="148" width="95" height="7" rx="3.5" fill="#e1d4c6" />
    </svg>
  )
}

function CleanVisual() {
  return (
    <svg className="feature-visual-svg" viewBox="0 0 320 188" role="presentation" focusable="false">
      <rect x="5" y="5" width="310" height="178" rx="16" fill="#f7f1eb" stroke="#d9cec2" />
      <rect x="16" y="17" width="124" height="154" rx="10" fill="#fff9f4" stroke="#e3d8ce" />
      <rect x="180" y="17" width="124" height="154" rx="10" fill="#fffdf9" stroke="#d6cfbf" />

      <rect x="24" y="24" width="68" height="14" rx="7" fill="#f5dddb" />
      <text x="58" y="33" textAnchor="middle" fontSize="8.6" fill="#8f2f22" fontFamily="ui-sans-serif, system-ui, sans-serif">With comments</text>

      <rect x="188" y="24" width="64" height="14" rx="7" fill="#ddebd8" />
      <text x="220" y="33" textAnchor="middle" fontSize="8.6" fill="#166534" fontFamily="ui-sans-serif, system-ui, sans-serif">Clean paste</text>

      <rect x="28" y="50" width="74" height="6" rx="3" fill="#d7c2ad" />
      <rect x="105" y="50" width="27" height="6" rx="3" fill="#f2c6c6" />
      <line x1="104" y1="53" x2="133" y2="53" stroke="#b91c1c" strokeWidth="1.6" strokeLinecap="round" />

      <rect x="28" y="62" width="62" height="6" rx="3" fill="#d7c2ad" />
      <rect x="93" y="62" width="39" height="6" rx="3" fill="#f2c6c6" />
      <line x1="92" y1="65" x2="133" y2="65" stroke="#b91c1c" strokeWidth="1.6" strokeLinecap="round" />

      <rect x="28" y="74" width="95" height="6" rx="3" fill="#d7c2ad" />
      <rect x="126" y="74" width="6" height="6" rx="3" fill="#f2c6c6" />
      <line x1="125" y1="77" x2="133" y2="77" stroke="#b91c1c" strokeWidth="1.6" strokeLinecap="round" />

      <rect x="28" y="90" width="81" height="6" rx="3" fill="#d7c2ad" />
      <rect x="112" y="90" width="20" height="6" rx="3" fill="#f2c6c6" />
      <line x1="111" y1="93" x2="133" y2="93" stroke="#b91c1c" strokeWidth="1.6" strokeLinecap="round" />

      <rect x="28" y="102" width="69" height="6" rx="3" fill="#d7c2ad" />
      <rect x="100" y="102" width="32" height="6" rx="3" fill="#f2c6c6" />
      <line x1="99" y1="105" x2="133" y2="105" stroke="#b91c1c" strokeWidth="1.6" strokeLinecap="round" />

      <rect x="28" y="118" width="92" height="6" rx="3" fill="#d7c2ad" />
      <rect x="123" y="118" width="9" height="6" rx="3" fill="#f2c6c6" />
      <line x1="122" y1="121" x2="133" y2="121" stroke="#b91c1c" strokeWidth="1.6" strokeLinecap="round" />

      <rect x="28" y="130" width="57" height="6" rx="3" fill="#d7c2ad" />
      <rect x="88" y="130" width="44" height="6" rx="3" fill="#f2c6c6" />
      <line x1="87" y1="133" x2="133" y2="133" stroke="#b91c1c" strokeWidth="1.6" strokeLinecap="round" />

      <rect x="28" y="142" width="85" height="6" rx="3" fill="#d7c2ad" />
      <rect x="116" y="142" width="16" height="6" rx="3" fill="#f2c6c6" />
      <line x1="115" y1="145" x2="133" y2="145" stroke="#b91c1c" strokeWidth="1.6" strokeLinecap="round" />

      <path d="M150 93h16" stroke="#8b5e34" strokeWidth="3" strokeLinecap="round" />
      <path d="M160 86l9 7-9 7" stroke="#8b5e34" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M153 73l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="#d97706" />
      <path d="M165 106l1.5 3 3 1.5-3 1.5-1.5 3-1.5-3-3-1.5 3-1.5z" fill="#d97706" />

      <rect x="192" y="50" width="96" height="7" rx="3.5" fill="#b88a62" />
      <rect x="192" y="62" width="76" height="6" rx="3" fill="#ccb8a2" />
      <rect x="192" y="74" width="90" height="6" rx="3" fill="#ccb8a2" />
      <rect x="192" y="86" width="84" height="6" rx="3" fill="#ccb8a2" />
      <rect x="192" y="98" width="101" height="6" rx="3" fill="#ccb8a2" />
      <rect x="192" y="110" width="65" height="6" rx="3" fill="#ccb8a2" />
      <rect x="192" y="122" width="88" height="6" rx="3" fill="#ccb8a2" />
      <rect x="192" y="134" width="74" height="6" rx="3" fill="#ccb8a2" />

      <rect x="247" y="144" width="47" height="18" rx="9" fill="#efe2d4" stroke="#d2bea8" />
      <text x="270.5" y="156" textAnchor="middle" fontSize="9.5" fill="#6b3410" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">LLM</text>
    </svg>
  )
}

function TokensVisual() {
  return (
    <svg className="feature-visual-svg" viewBox="0 0 320 188" role="presentation" focusable="false">
      <rect x="5" y="5" width="310" height="178" rx="16" fill="#f7f1eb" stroke="#d9cec2" />
      <rect x="16" y="17" width="200" height="154" rx="10" fill="#fff9f3" stroke="#e3d8ce" />
      <rect x="224" y="17" width="80" height="154" rx="10" fill="#f4ece1" stroke="#ddcfc1" />

      <rect x="28" y="31" width="92" height="8" rx="4" fill="#c8b39d" />
      <rect x="28" y="45" width="64" height="6" rx="3" fill="#dccbbc" />
      <rect x="28" y="57" width="132" height="6" rx="3" fill="#dccbbc" />
      <rect x="28" y="69" width="115" height="6" rx="3" fill="#dccbbc" />
      <rect x="28" y="81" width="142" height="6" rx="3" fill="#dccbbc" />

      <rect x="24" y="92" width="184" height="36" rx="8" fill="#f4dec4" />
      <rect x="30" y="100" width="110" height="6" rx="3" fill="#b86f35" />
      <rect x="30" y="112" width="168" height="6" rx="3" fill="#d3a177" />

      <rect x="28" y="136" width="138" height="6" rx="3" fill="#dccbbc" />
      <rect x="28" y="148" width="92" height="6" rx="3" fill="#dccbbc" />

      <circle cx="264" cy="63" r="25" fill="#fefaf4" stroke="#d4c6b7" strokeWidth="6" />
      <circle
        cx="264"
        cy="63"
        r="25"
        fill="none"
        stroke="#b45309"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray="118 157"
        transform="rotate(-90 264 63)"
      />
      <text x="264" y="67" textAnchor="middle" fontSize="12" fill="#92400e" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">75%</text>

      <rect x="232" y="101" width="64" height="22" rx="11" fill="#efe2d4" stroke="#d9c7b6" />
      <text x="264" y="115" textAnchor="middle" fontSize="11" fill="#6b3410" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">~1240 tok</text>
      <rect x="240" y="129" width="48" height="18" rx="9" fill="#f5e9db" stroke="#d9c7b6" />
      <text x="264" y="141" textAnchor="middle" fontSize="10" fill="#6b3410" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">sel 220</text>
    </svg>
  )
}

function DiffVisual() {
  return (
    <svg className="feature-visual-svg" viewBox="0 0 320 188" role="presentation" focusable="false">
      <rect x="5" y="5" width="310" height="178" rx="16" fill="#f7f1eb" stroke="#d9cec2" />
      <rect x="16" y="17" width="288" height="22" rx="11" fill="#eadfce" />
      <rect x="26" y="21" width="62" height="14" rx="7" fill="#f1d4cc" />
      <rect x="92" y="21" width="62" height="14" rx="7" fill="#d7e7d4" />
      <text x="57" y="31" textAnchor="middle" fontSize="9" fill="#8f2f22" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">v2</text>
      <text x="123" y="31" textAnchor="middle" fontSize="9" fill="#166534" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">v3</text>

      <rect x="16" y="45" width="138" height="126" rx="10" fill="#fff8f8" stroke="#e9cecb" />
      <rect x="166" y="45" width="138" height="126" rx="10" fill="#f8fff8" stroke="#cde6cd" />

      <rect x="26" y="58" width="118" height="8" rx="4" fill="#f3e2e1" />
      <rect x="176" y="58" width="118" height="8" rx="4" fill="#dff2df" />

      <rect x="26" y="72" width="118" height="16" rx="4" fill="#f7d5d3" />
      <rect x="176" y="72" width="118" height="16" rx="4" fill="#d3f0d3" />
      <rect x="30" y="77" width="84" height="6" rx="3" fill="#b91c1c" />
      <rect x="180" y="77" width="93" height="6" rx="3" fill="#15803d" />

      <rect x="26" y="94" width="118" height="11" rx="4" fill="#f3e2e1" />
      <rect x="176" y="94" width="118" height="11" rx="4" fill="#e7f5e7" />
      <rect x="30" y="97" width="95" height="6" rx="3" fill="#b2aca4" />
      <rect x="180" y="97" width="95" height="6" rx="3" fill="#a6c5a6" />

      <rect x="26" y="111" width="118" height="13" rx="4" fill="#f7d5d3" />
      <rect x="176" y="111" width="118" height="13" rx="4" fill="#d3f0d3" />
      <rect x="30" y="114" width="73" height="6" rx="3" fill="#b91c1c" />
      <rect x="180" y="114" width="82" height="6" rx="3" fill="#15803d" />

      <rect x="26" y="130" width="118" height="9" rx="4" fill="#f3e2e1" />
      <rect x="176" y="130" width="118" height="9" rx="4" fill="#e7f5e7" />
      <rect x="26" y="145" width="88" height="9" rx="4" fill="#f3e2e1" />
      <rect x="176" y="145" width="99" height="9" rx="4" fill="#e7f5e7" />
    </svg>
  )
}

export default function LandingFeatureVisual({ kind }: LandingFeatureVisualProps) {
  return (
    <div className={`feature-visual ${kind}`} aria-hidden="true">
      {kind === 'browse' && <BrowseVisual />}
      {kind === 'clean' && <CleanVisual />}
      {kind === 'tokens' && <TokensVisual />}
      {kind === 'diff' && <DiffVisual />}
    </div>
  )
}
