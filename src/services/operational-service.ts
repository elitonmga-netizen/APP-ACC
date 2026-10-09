import { clients, climateSystems, equipment, locations, maintenanceItems, serviceOrders, technicians } from '../mocks/operational'
import { apiEnabled } from './api'
import { createEntityService } from './entity-service'
if (apiEnabled) for (const records of [clients, climateSystems, equipment, locations, maintenanceItems, serviceOrders, technicians]) records.splice(0)
export const operationalService = {
  clients: createEntityService(clients, 'clients'), locations: createEntityService(locations, 'locations'), equipment: createEntityService(equipment, 'equipment'),
  orders: createEntityService(serviceOrders, 'service-orders'), maintenance: createEntityService(maintenanceItems, 'maintenance'),
  technicians: createEntityService(technicians, 'technicians'), systems: createEntityService(climateSystems, 'climate-systems'),
}
export async function loadOperationalData() { await Promise.all(Object.values(operationalService).map(service => service.load())) }
