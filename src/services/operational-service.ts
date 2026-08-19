import { clients, equipment, locations, maintenanceItems, serviceOrders } from '../mocks/operational'
import { createEntityService } from './entity-service'

export const operationalService = {
  clients: createEntityService(clients), locations: createEntityService(locations), equipment: createEntityService(equipment),
  orders: createEntityService(serviceOrders), maintenance: createEntityService(maintenanceItems),
}
