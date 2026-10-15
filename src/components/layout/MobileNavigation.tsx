type Props = { activeItem: string; onNavigate: (label: string) => void; onMenu: () => void }
export function MobileNavigation({ activeItem, onNavigate, onMenu }: Props) {
  const entries = [['Dashboard', 'Início', '▦'], ['Ordens de Serviço', 'Ordens', '✓'], ['Relatórios', 'Relatórios', '◫'], ['Configurações', 'Ajustes', '⚙']]
  return <nav className="mobile-navigation" aria-label="Navegação mobile">
    {entries.map(([route, label, icon]) => <button key={route} aria-current={activeItem === route ? 'page' : undefined} onClick={() => onNavigate(route)}><span aria-hidden="true">{icon}</span>{label}</button>)}
    <button onClick={onMenu}><span aria-hidden="true">☰</span>Mais</button>
  </nav>
}
