export type NavigationItem = { label: string; icon: string }
export type ServiceOrder = { id: string; client: string; location: string; status: 'Agendada' | 'Em andamento' | 'Concluída'; time: string }
