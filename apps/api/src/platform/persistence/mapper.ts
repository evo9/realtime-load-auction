export interface Mapper<Domain, Entity> {
  toDomain(entity: Entity): Domain;
  toEntity(domain: Domain): Entity;
}
