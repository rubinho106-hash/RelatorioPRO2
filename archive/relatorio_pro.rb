# frozen_string_literal: true

require 'json'
require 'fileutils'
require 'zlib'
begin
  require_relative '../ruby/relatorio_pro'
rescue LoadError
  nil
end

module RelatorioPRO
  PLUGIN_ID = 'RelatorioPRO'.freeze
  COMMAND_NAME = 'Relatorio Engenharia PRO'.freeze
  TOOLBAR_NAME = 'Relatorio PRO'.freeze

  BASE_LENGTH_FACTOR = 0.0254
  BASE_AREA_FACTOR = BASE_LENGTH_FACTOR**2
  BASE_VOLUME_FACTOR = BASE_LENGTH_FACTOR**3

  ROUND_OPTIONS = {
    0 => '0', 1 => '0.0', 2 => '0.00', 3 => '0.000',
    4 => '0.0000', 5 => '0.00000', 6 => '0.000000'
  }.freeze

  LENGTH_OPTIONS = { 1 => 'm', 100 => 'cm', 1000 => 'mm' }.freeze
  AREA_OPTIONS = { 1 => 'm²', 10_000 => 'cm²', 1_000_000 => 'mm²' }.freeze
  VOLUME_OPTIONS = { 1 => 'm³', 1_000_000 => 'cm³', 1_000_000_000 => 'mm³' }.freeze

  DEFAULT_SETTINGS = {
    round_length: '0.00',
    format_length: 'm',
    round_area: '0.00',
    format_area: 'm²',
    round_volume: '0.000',
    format_volume: 'm³',
    decimal_separator: '.',
    concrete_cover_thickness_m: 0.05,
    slab_mode: 'nervurada',
    slab_ribbed_factor_m: 0.10,
    concrete_density_kg_m3: 2500.0,
    concrete_cost_per_m3: 0.0,
    eps_cost_per_m3: 0.0
  }.freeze

  VALID_IFC_TYPES = %w[
    IfcBeam IfcColumn IfcSlab IfcWall IfcWallStandardCase IfcDoor IfcWindow
    IfcRoof IfcStair IfcStairFlight IfcRamp IfcRampFlight IfcPlate IfcMember
    IfcFooting IfcPile IfcBuildingElementProxy IfcCurtainWall IfcCovering
    IfcFurnishingElement IfcFlowTerminal IfcFlowSegment IfcFlowFitting
    IfcSpace IfcZone IfcBuildingStorey IfcBuilding IfcSite IfcProject
    IfcOpeningElement IfcAnnotation IfcGrid IfcTransportElement
  ].freeze

  IFC_PHYSICAL_TYPES = %w[
    IfcBeam IfcColumn IfcSlab IfcWall IfcWallStandardCase IfcDoor IfcWindow
    IfcRoof IfcStair IfcStairFlight IfcRamp IfcRampFlight IfcPlate IfcMember
    IfcFooting IfcPile IfcBuildingElementProxy IfcCurtainWall IfcCovering
    IfcFurnishingElement IfcFlowTerminal IfcFlowSegment IfcFlowFitting
    IfcOpeningElement IfcTransportElement
  ].freeze

  IFC_STRUCTURE_TYPES = %w[
    IfcProject IfcSite IfcBuilding IfcBuildingStorey IfcSpace IfcZone IfcGrid IfcAnnotation
  ].freeze

  IFC_TYPE_KEYS = %w[IfcObjectType ObjectType IfcType ifc_type type objecttype].freeze
  IFC_DICT_NAMES = %w[ifc ifc2x3 ifc4 IFC IFC2X3 IFC4].freeze

  module Cache
    @settings = nil
    @instance_count_by_definition = {}
    @definition_area_m2 = {}
    @definition_volume_m3 = {}
    @entity_area_m2 = {}
    @entity_volume_m3 = {}
    @row_by_entity = {}
    @group_payload_signature = nil
    @group_payload_rows = nil
    @entity_group_key = {}
    @storey_cache = {}

    class << self
      def invalidate!
        @settings = nil
        @instance_count_by_definition.clear
        @definition_area_m2.clear
        @definition_volume_m3.clear
        @entity_area_m2.clear
        @entity_volume_m3.clear
        @row_by_entity.clear
        @group_payload_signature = nil
        @group_payload_rows = nil
        @entity_group_key.clear
        @storey_cache.clear
      end

      def invalidate_geometry!
        @instance_count_by_definition.clear
        @definition_area_m2.clear
        @definition_volume_m3.clear
        @entity_area_m2.clear
        @entity_volume_m3.clear
        @group_payload_signature = nil
        @group_payload_rows = nil
        @storey_cache.clear
      end

      def invalidate_row(entity_or_id)
        pid = entity_or_id.respond_to?(:persistent_id) ? entity_or_id.persistent_id : entity_or_id.to_i
        @row_by_entity.delete(pid)
        @entity_group_key.delete(pid)
      rescue StandardError
        nil
      end

      def group_payload(signature)
        return nil unless @group_payload_signature == signature

        @group_payload_rows
      end

      def storey_cache
        @storey_cache ||= {}
      end

      def store_group_payload(signature, rows, entity_group_key)
        @group_payload_signature = signature
        @group_payload_rows = rows
        @entity_group_key = entity_group_key
        rows
      end

      def clear_group_payload
        @group_payload_signature = nil
        @group_payload_rows = nil
      end

      def group_key_for_entity(entity_or_id)
        pid = entity_or_id.respond_to?(:persistent_id) ? entity_or_id.persistent_id : entity_or_id.to_i
        @entity_group_key[pid]
      rescue StandardError
        nil
      end

      def store_entity_group_key_map(map)
        @entity_group_key = map
      end

      def settings
        return @settings if @settings

        @settings = DEFAULT_SETTINGS.each_with_object({}) do |(key, default_value), memo|
          memo[key] = Sketchup.read_default(PLUGIN_ID, key.to_s, default_value)
        end
      end

      def total_for(definition)
        pid = definition.persistent_id
        return @instance_count_by_definition[pid] if @instance_count_by_definition.key?(pid)

        @instance_count_by_definition[pid] = definition.instances.length
      rescue StandardError
        1
      end

      def definition_area(definition)
        pid = definition.persistent_id
        return @definition_area_m2[pid] if @definition_area_m2.key?(pid)

        @definition_area_m2[pid] = Geometry.definition_surface_area_m2(definition)
      end

      def definition_volume(definition)
        pid = definition.persistent_id
        return @definition_volume_m3[pid] if @definition_volume_m3.key?(pid)

        @definition_volume_m3[pid] = Geometry.definition_volume_m3(definition)
      end

      def entity_area(entity)
        key = [entity.definition.persistent_id, transformation_key(entity.transformation)]
        return @entity_area_m2[key] if @entity_area_m2.key?(key)

        @entity_area_m2[key] = Geometry.entity_surface_area_m2(entity, definition_area(entity.definition))
      end

      def entity_volume(entity)
        key = [entity.definition.persistent_id, transformation_key(entity.transformation)]
        return @entity_volume_m3[key] if @entity_volume_m3.key?(key)

        @entity_volume_m3[key] = Geometry.entity_volume_m3(entity, definition_volume(entity.definition))
      end

      def row(entity, settings, custom_key)
        pid = entity.persistent_id
        signature = row_signature(entity, settings, custom_key)
        cached = @row_by_entity[pid]
        return cached[:value] if cached && cached[:signature] == signature

        row = Data.build_row(entity, settings, custom_key)
        @row_by_entity[pid] = { signature: signature, value: row }
        row
      end

      private

      def row_signature(entity, settings, custom_key)
        definition = entity.definition
        [
          settings[:round_length], settings[:format_length],
          settings[:round_area], settings[:format_area],
          settings[:round_volume], settings[:format_volume],
          settings[:decimal_separator],
          settings[:concrete_cover_thickness_m],
          settings[:slab_mode],
          settings[:slab_ribbed_factor_m],
          settings[:concrete_density_kg_m3],
          settings[:concrete_cost_per_m3],
          settings[:eps_cost_per_m3],
          custom_key.to_s,
          definition.persistent_id,
          transformation_key(entity.transformation),
          entity.name.to_s,
          definition.name.to_s,
          Data.description_for(entity).to_s,
          entity.layer&.name.to_s,
          total_for(definition),
          *Geometry.local_dimensions_m(entity).map { |value| value.to_f.round(6) },
          entity_area(entity).to_f.round(6),
          entity_volume(entity).to_f.round(6)
        ].join('|')
      rescue StandardError
        [entity.persistent_id, custom_key.to_s].join('|')
      end

      def transformation_key(transformation)
        transformation.to_a.map { |n| n.to_f.round(8) }.join(',')
      rescue StandardError
        'identity'
      end
    end
  end

  module Geometry
    module_function

    # Coleta todas as faces recursivamente (1 nível direto + sub-grupos/componentes)
    def collect_faces_recursive(entities, transformation = nil, accumulator = [])
      entities.each do |ent|
        case ent
        when Sketchup::Face
          accumulator << [ent, transformation]
        when Sketchup::Group, Sketchup::ComponentInstance
          child_def = ent.is_a?(Sketchup::Group) ? ent.entities : ent.definition.entities
          child_xform = transformation ? transformation * ent.transformation : ent.transformation
          collect_faces_recursive(child_def, child_xform, accumulator)
        end
      end
      accumulator
    end

    # Área da face dominante: produto das duas maiores dimensões do bounding box
    # (equivalente à área de planta para lajes, área de elevação para paredes, etc.)
    def definition_surface_area_m2(definition)
      bb = definition.bounds
      dims = [bb.width.to_f, bb.depth.to_f, bb.height.to_f]
               .map { |d| d * BASE_LENGTH_FACTOR }
               .sort
      # dois maiores → produto = área da face dominante
      dims[1] * dims[2]
    rescue StandardError
      0.0
    end

    def entity_surface_area_m2(entity, _cached = nil)
      # local_dimensions_m já aplica os fatores de escala da transformação
      dims = local_dimensions_m(entity).map(&:abs).sort
      dims[1] * dims[2]
    rescue StandardError
      0.0
    end

    def definition_volume_m3(definition)
      return nil unless definition.respond_to?(:manifold?) && definition.respond_to?(:volume)
      return nil unless definition.manifold?

      definition.volume.to_f * BASE_VOLUME_FACTOR
    rescue StandardError
      nil
    end

    def entity_volume_m3(entity, cached_definition_volume_m3 = nil)
      if cached_definition_volume_m3
        sx, sy, sz = scale_factors(entity.transformation)
        return cached_definition_volume_m3 * (sx * sy * sz).abs
      end

      bbox = entity.bounds
      bbox.width.to_f * bbox.depth.to_f * bbox.height.to_f * BASE_VOLUME_FACTOR
    rescue StandardError
      0.0
    end

    def local_dimensions_m(entity)
      bb = entity.definition.bounds
      sx, sy, sz = scale_factors(entity.transformation)

      [
        bb.width.to_f * sx * BASE_LENGTH_FACTOR,
        bb.depth.to_f * sy * BASE_LENGTH_FACTOR,
        bb.height.to_f * sz * BASE_LENGTH_FACTOR
      ]
    rescue StandardError
      bbox = entity.bounds
      [
        bbox.width.to_f * BASE_LENGTH_FACTOR,
        bbox.depth.to_f * BASE_LENGTH_FACTOR,
        bbox.height.to_f * BASE_LENGTH_FACTOR
      ]
    end

    def scale_factors(transformation)
      [
        Geom::Vector3d.new(transformation.xaxis).length,
        Geom::Vector3d.new(transformation.yaxis).length,
        Geom::Vector3d.new(transformation.zaxis).length
      ]
    end

    def approximately_equal?(a, b)
      (a.to_f - b.to_f).abs <= 1e-8
    end

    # Comprimento real de uma viga pela maior aresta transformada para espaço mundo.
    # Mais preciso que bbox para peças inclinadas ou com geometria não-retangular.
    def real_beam_length_m(entity)
      transform = entity.transformation
      max_len = 0.0
      entity.definition.entities.each do |ent|
        next unless ent.is_a?(Sketchup::Edge)

        pt1 = ent.start.position.transform(transform)
        pt2 = ent.end.position.transform(transform)
        len = pt1.distance(pt2).to_f * BASE_LENGTH_FACTOR
        max_len = len if len > max_len
      end
      return max_len if max_len > 0.0

      local_dimensions_m(entity).map(&:abs).max
    rescue StandardError
      local_dimensions_m(entity).map(&:abs).max
    end

    # Área real de uma laje pela face horizontal de maior área (espaço local escalado).
    # Substitui o produto das dimensões bbox, que falha em plantas irregulares.
    def real_slab_area_m2(entity)
      transform = entity.transformation
      definition = entity.definition
      sx, sy, _sz = scale_factors(transform)

      best_area = 0.0
      definition.entities.each do |ent|
        next unless ent.is_a?(Sketchup::Face)
        # Usa normal em espaço mundo para lidar com componentes com eixos locais não-padrão
        world_normal = ent.normal.transform(transform)
        wlen = world_normal.length.to_f
        next if wlen < 1e-9
        next unless (world_normal.z.to_f / wlen).abs > 0.707

        # face.area em unidades internas do SU (polegadas²); aplica escala XY e converte
        area_m2 = ent.area.to_f * (sx * sy).abs * BASE_AREA_FACTOR
        best_area = area_m2 if area_m2 > best_area
      end

      return best_area if best_area > 0.0

      # Fallback: área de planta pela bbox em espaço mundo (ordena e descarta dimensão menor)
      bbox = entity.bounds
      dims = [
        bbox.width.to_f * BASE_LENGTH_FACTOR,
        bbox.depth.to_f * BASE_LENGTH_FACTOR,
        bbox.height.to_f * BASE_LENGTH_FACTOR
      ].map(&:abs).sort
      dims[1] * dims[2]
    rescue StandardError
      0.0
    end
  end

  module Formatting
    module_function

    def measure(value, type, settings)
      case type
      when :length
        format_measure(value, settings[:format_length], settings[:round_length], settings[:decimal_separator])
      when :area
        format_measure(value, settings[:format_area], settings[:round_area], settings[:decimal_separator])
      when :volume
        format_measure(value, settings[:format_volume], settings[:round_volume], settings[:decimal_separator])
      else
        value.to_s
      end
    end

    def format_measure(value, unit, pattern, decimal_separator)
      decimals = decimals_from_pattern(pattern)
      scaled = value.to_f * unit_multiplier(unit)
      format_number(scaled, decimals, decimal_separator)
    end

    def unit_multiplier(unit)
      case unit
      when 'cm' then 100
      when 'mm' then 1000
      when 'cm²' then 10_000
      when 'mm²' then 1_000_000
      when 'cm³' then 1_000_000
      when 'mm³' then 1_000_000_000
      else 1
      end
    end

    def decimals_from_pattern(pattern)
      pattern.to_s.split('.').last.to_s.length
    end

    def format_number(value, decimals, decimal_separator)
      rounded = format("%.#{decimals}f", value.to_f)
      int_part, dec_part = rounded.split('.')
      thousand_separator = decimal_separator == ',' ? '.' : ','
      int_grouped = int_part.reverse.gsub(/(\d{3})(?=\d)/, "\\1#{thousand_separator}").reverse
      return int_grouped if decimals.zero?

      [int_grouped, dec_part].join(decimal_separator)
    end
  end

  module Data
    module_function

    def ifc_summary_for_model(model)
      counts = {
        physical_elements: Hash.new(0),
        ifc_structure: Hash.new(0),
        other_types: Hash.new(0)
      }

      # por_pavimento: { storey_key => { ifc_type => { qty, ml, area } } }
      por_pavimento = Hash.new { |h, k| h[k] = Hash.new { |h2, k2| h2[k2] = { quantidade: 0, metro_linear_m: 0.0, area_m2: 0.0 } } }

      model.definitions.each do |definition|
        dict = definition.attribute_dictionary('AppliedSchemaTypes', false)
        next unless dict

        instance_count = Cache.total_for(definition).to_i
        next if instance_count <= 0

        types = []
        dict.each_pair do |_schema, raw_type|
          normalized = normalize_ifc_type(raw_type.to_s)
          type = normalized.empty? ? raw_type.to_s.strip : normalized
          next if type.empty?

          types << type
        end

        types.uniq.each do |type|
          if IFC_PHYSICAL_TYPES.any? { |known| known.casecmp(type).zero? }
            counts[:physical_elements][type] += instance_count
          elsif IFC_STRUCTURE_TYPES.any? { |known| known.casecmp(type).zero? }
            counts[:ifc_structure][type] += instance_count
          else
            counts[:other_types][type] += instance_count
          end
        end

        # Agregar por pavimento (requer instâncias para storey_for)
        definition.instances.each do |inst|
          next unless inst.valid?

          type = types.first
          next unless type
          next unless IFC_PHYSICAL_TYPES.any? { |known| known.casecmp(type).zero? }

          storey = storey_for(inst)
          family = ifc_structural_family(type)
          bucket = por_pavimento[storey][type]
          bucket[:quantidade] += 1
          case family
          when :beam
            bucket[:metro_linear_m] += Geometry.real_beam_length_m(inst)
          when :column
            bucket[:metro_linear_m] += (inst.bounds.height.to_f * BASE_LENGTH_FACTOR).abs
          when :slab
            bucket[:area_m2] += Geometry.real_slab_area_m2(inst)
          end
        end
      end

      physical_rows = summarize_ifc_bucket(counts[:physical_elements])
      structure_rows = summarize_ifc_bucket(counts[:ifc_structure])
      other_rows = summarize_ifc_bucket(counts[:other_types])
      storey_rows = summarize_storey_buckets(por_pavimento)

      {
        physical_elements: physical_rows,
        ifc_structure: structure_rows,
        other_types: other_rows,
        por_pavimento: storey_rows,
        totals: {
          physical_elements: physical_rows.sum { |row| row[:quantity] },
          ifc_structure: structure_rows.sum { |row| row[:quantity] },
          other_types: other_rows.sum { |row| row[:quantity] },
          overall: physical_rows.sum { |row| row[:quantity] } +
                   structure_rows.sum { |row| row[:quantity] } +
                   other_rows.sum { |row| row[:quantity] }
        }
      }
    rescue StandardError
      {
        physical_elements: [],
        ifc_structure: [],
        other_types: [],
        por_pavimento: [],
        totals: {
          physical_elements: 0,
          ifc_structure: 0,
          other_types: 0,
          overall: 0
        }
      }
    end

    def summarize_storey_buckets(por_pavimento)
      por_pavimento.keys.sort.map do |storey|
        tipos = por_pavimento[storey]
        entries = tipos.keys.sort.map do |type|
          b = tipos[type]
          { ifc: type, quantidade: b[:quantidade], metro_linear_m: b[:metro_linear_m].to_f, area_m2: b[:area_m2].to_f }
        end
        { storey: storey, tipos: entries, total: entries.sum { |e| e[:quantidade] } }
      end
    end

    def summarize_ifc_bucket(bucket)
      bucket.keys.sort_by { |type| [-bucket[type].to_i, type.to_s] }.map do |type|
        { ifc: type, quantity: bucket[type].to_i }
      end
    end

    # Varre todo o modelo recursivamente e retorna apenas elementos físicos IFC.
    # Substitui a coleta por seleção (model.selection) pela fonte correta: modelo IFC completo.
    def selected_entities(model)
      all_ifc_entities(model)
    end

    # Coleta via model.definitions — abordagem mais robusta para IFC:
    # garante todos os elementos colocados, independente da profundidade na hierarquia.
    def all_ifc_entities(model)
      result = []
      seen = {}

      model.definitions.each do |defn|
        next if defn.image?

        ifc = ifc_type_from_applied_schema(defn)
        next if ifc.empty?
        next unless IFC_PHYSICAL_TYPES.any? { |t| t.casecmp(ifc).zero? }

        defn.instances.each do |inst|
          next unless inst.valid?
          pid = inst.persistent_id
          next if seen[pid]

          seen[pid] = true
          result << inst
        end
      end

      result
    end

    def collect_rows(model, settings, custom_key)
      selected_entities(model).map { |entity| Cache.row(entity, settings, custom_key) }
    end

    def group_entities_pro(model, settings, custom_key)
      entities = selected_entities(model)
      signature = grouping_signature(entities, settings, custom_key)
      cached = Cache.group_payload(signature)
      return cached if cached

      groups = {}
      entity_group_key = {}

      entities.each do |entity|
        ifc_type = ifc_type_for(entity)
        metrics = engineering_metrics_for(entity, settings, ifc_type)
        key = [
          ifc_type,
          metrics[:tipo_estrutural],
          metrics[:perfil_key],
          metrics[:material_key],
          metrics[:storey_key]
        ].join('|')
        entity_group_key[entity.persistent_id] = key

        groups[key] ||= {
          ifc: ifc_type,
          tipo: metrics[:tipo_estrutural],
          secao: metrics[:secao],
          comprimento_m: metrics[:comprimento_m],
          quantidade: 0,
          metro_linear_total_m: 0.0,
          volume_total_m3: 0.0,
          area_total_m2: 0.0,
          eps_volume_total_m3: 0.0,
          concrete_cost_total: 0.0,
          eps_cost_total: 0.0,
          slab_weight_total_kg: 0.0,
          instancias: [],
          material: metrics[:material],
          storey: metrics[:storey],
          tag: resolve_tag(entity)
        }

        bucket = groups[key]
        bucket[:quantidade] += 1
        bucket[:metro_linear_total_m] += metrics[:comprimento_m]
        bucket[:volume_total_m3] += metrics[:volume_m3]
        bucket[:area_total_m2] += metrics[:area_m2]
        bucket[:eps_volume_total_m3] += metrics[:eps_volume_m3]
        bucket[:concrete_cost_total] += metrics[:concrete_cost]
        bucket[:eps_cost_total] += metrics[:eps_cost]
        bucket[:slab_weight_total_kg] += metrics[:slab_weight_kg]
        bucket[:instancias] << entity.persistent_id
      end

      rows = groups.keys.sort.map { |key| build_group_row(key, groups[key], settings) }
      Cache.store_group_payload(signature, rows, entity_group_key)
    end

    def group_updates_for_entity(model, entity, settings)
      old_key = Cache.group_key_for_entity(entity)

      entities = selected_entities(model)
      descriptors = {}
      entity_group_key = {}

      entities.each do |ent|
        ifc_type = ifc_type_for(ent)
        metrics = engineering_metrics_for(ent, settings, ifc_type)
        key = [
          ifc_type,
          metrics[:tipo_estrutural],
          metrics[:perfil_key],
          metrics[:material_key],
          metrics[:storey_key]
        ].join('|')
        entity_group_key[ent.persistent_id] = key

        descriptors[key] ||= {
          ifc: ifc_type,
          tipo: metrics[:tipo_estrutural],
          secao: metrics[:secao],
          comprimento_m: metrics[:comprimento_m],
          quantidade: 0,
          metro_linear_total_m: 0.0,
          volume_total_m3: 0.0,
          area_total_m2: 0.0,
          eps_volume_total_m3: 0.0,
          concrete_cost_total: 0.0,
          eps_cost_total: 0.0,
          slab_weight_total_kg: 0.0,
          instancias: [],
          material: metrics[:material],
          storey: metrics[:storey],
          tag: resolve_tag(ent)
        }

        bucket = descriptors[key]
        bucket[:quantidade] += 1
        bucket[:metro_linear_total_m] += metrics[:comprimento_m]
        bucket[:volume_total_m3] += metrics[:volume_m3]
        bucket[:area_total_m2] += metrics[:area_m2]
        bucket[:eps_volume_total_m3] += metrics[:eps_volume_m3]
        bucket[:concrete_cost_total] += metrics[:concrete_cost]
        bucket[:eps_cost_total] += metrics[:eps_cost]
        bucket[:slab_weight_total_kg] += metrics[:slab_weight_kg]
        bucket[:instancias] << ent.persistent_id
      end

      Cache.store_entity_group_key_map(entity_group_key)
      Cache.clear_group_payload

      new_key = entity_group_key[entity.persistent_id]
      affected = [old_key, new_key].compact.uniq

      affected.map do |key|
        bucket = descriptors[key]
        if bucket
          build_group_row(key, bucket, settings)
        else
          {
            id: group_row_id(key),
            group_id: group_hash_id(key),
            is_group: true,
            _deleted: true
          }
        end
      end
    end

    def build_row(entity, settings, custom_key)
      object_type = entity.is_a?(Sketchup::Group) ? 'group' : 'component'
      definition = entity.definition
      ifc_type = ifc_type_for(entity)
      metrics = engineering_metrics_for(entity, settings, ifc_type)

      len_x, len_y, len_z = Geometry.local_dimensions_m(entity)
      area_xy = len_x.to_f.abs * len_y.to_f.abs
      area_total = metrics[:area_m2]
      volume_total = metrics[:volume_m3]

      {
        id: "#{entity.persistent_id}-#{object_type}",
        persistent_id: entity.persistent_id.to_s,
        ordinal: '',
        image: sanitize_url(image_url_for(entity)),
        entity: object_type == 'group' ? 'Group' : 'Component',
        definition: safe_text(smart_definition_name(entity, ifc_type, definition)),
        instance: safe_text(entity.name),
        description: safe_text(description_for(entity)),

        len_x: Formatting.measure(len_x, :length, settings),
        len_y: Formatting.measure(len_y, :length, settings),
        len_z: Formatting.measure(len_z, :length, settings),
        len_xz: [Formatting.measure(len_x, :length, settings), Formatting.measure(len_z, :length, settings)].join(' x '),
        len_xy: [Formatting.measure(len_x, :length, settings), Formatting.measure(len_y, :length, settings)].join(' x '),
        len_xyz: [Formatting.measure(len_x, :length, settings), Formatting.measure(len_y, :length, settings), Formatting.measure(len_z, :length, settings)].join(' x '),

        area_xz: Formatting.measure(0.0, :area, settings),
        area_xy: Formatting.measure(area_xy, :area, settings),
        area: Formatting.measure(area_total, :area, settings),
        volume: Formatting.measure(volume_total, :volume, settings),
        eps_volume_m3: metrics[:eps_volume_m3],
        concrete_cost: metrics[:concrete_cost],
        eps_cost: metrics[:eps_cost],
        slab_weight_kg: metrics[:slab_weight_kg],

        ifc: ifc_type,
        tag: resolve_tag(entity),

        status: advanced_attribute_for(entity, %w[status phase condition state]),
        owner: advanced_attribute_for(entity, %w[owner responsible author]),
        url: sanitize_url(advanced_attribute_for(entity, %w[url link website])),
        size: advanced_attribute_for(entity, %w[size unit_size dimensions]),
        price: advanced_attribute_for(entity, %w[price unit_price cost]),

        custom: dynamic_value_for(entity, custom_key),

        quantity: 1,
        total: Cache.total_for(definition)
      }
    end

    def tipo_estrutural_from_ifc(ifc, entity = nil)
      case ifc.to_s
      when /IfcBeam/i then classify_beam_subtype(entity)
      when /IfcColumn/i then 'Pilar'
      when /IfcFooting|IfcPile/i then 'Fundacao'
      when /IfcSlab/i then 'Laje'
      when /IfcWall|IfcWallStandardCase|IfcCurtainWall/i then 'Parede'
      else 'Outro'
      end
    end

    # Classifica vigas em subtipos de engenharia combinando contexto IFC (pavimento)
    # e posição relativa no modelo.
    def classify_beam_subtype(entity)
      return 'Viga' unless entity

      storey = storey_for(entity)
      return 'Viga Baldrame' if storey.casecmp('PAVIMENTO 00').zero? || storey.casecmp('TERREO').zero?

      model = Sketchup.active_model
      model_bb = model.bounds
      model_min_z = model_bb.min.z.to_f * BASE_LENGTH_FACTOR
      model_max_z = model_bb.max.z.to_f * BASE_LENGTH_FACTOR
      model_height = (model_max_z - model_min_z).abs
      return 'Viga' if model_height < 0.01

      # Centro Z da viga em metros
      center_z = entity.bounds.center.z.to_f * BASE_LENGTH_FACTOR
      relative_z = (center_z - model_min_z) / model_height

      if relative_z <= 0.15
        'Viga Baldrame'
      elsif relative_z >= 0.85
        'Viga Marquise'
      else
        'Viga Central'
      end
    rescue StandardError
      'Viga'
    end

    def engineering_metrics_for(entity, settings, ifc_type = nil)
      normalized_ifc = (ifc_type || ifc_type_for(entity)).to_s
      family = ifc_structural_family(normalized_ifc)
      storey_value = storey_for(entity)
      material_value = normalize_material(material_for(entity))

      local_dims = Geometry.local_dimensions_m(entity).map(&:abs).sort
      sec_a = local_dims[0].to_f
      sec_b = local_dims[1].to_f
      sec_c = local_dims[2].to_f

      bbox = entity.bounds
      world_x = (bbox.width.to_f * BASE_LENGTH_FACTOR).abs
      world_y = (bbox.depth.to_f * BASE_LENGTH_FACTOR).abs
      world_z = (bbox.height.to_f * BASE_LENGTH_FACTOR).abs
      plan_len = [world_x, world_y].max

      comprimento_m = 0.0
      area_m2 = Cache.entity_area(entity).to_f
      volume_m3 = Cache.entity_volume(entity).to_f
      eps_volume_m3 = 0.0
      concrete_cost = 0.0
      eps_cost = 0.0
      slab_weight_kg = 0.0
      secao_label = "#{Formatting.measure(sec_a, :length, settings)} x #{Formatting.measure(sec_b, :length, settings)}"
      comprimento_key = '0'
      perfil_key = "GEN|#{round_profile_value(sec_a)}|#{round_profile_value(sec_b)}|#{round_profile_value(sec_c)}"

      case family
      when :beam
        comprimento_m = Geometry.real_beam_length_m(entity)
        comprimento_key = rounded_length_key(comprimento_m, settings)
        perfil_key = "BEAM|#{round_profile_value(sec_a)}|#{round_profile_value(sec_b)}|#{round_profile_value(comprimento_m)}"
      when :column
        comprimento_m = world_z
        comprimento_key = rounded_length_key(comprimento_m, settings)
        perfil_key = "COL|#{round_profile_value(sec_a)}|#{round_profile_value(sec_b)}|#{round_profile_value(comprimento_m)}"
      when :slab
        thickness = sec_a
        secao_label = "Esp. #{Formatting.measure(thickness, :length, settings)}"
        comprimento_m = 0.0
        comprimento_key = 'SLAB'
        area_m2 = Geometry.real_slab_area_m2(entity)
        slab_mode = slab_mode_setting(settings)
        fator_nervurado_m = slab_ribbed_factor_m(settings)
        capa_concreto_m = concrete_cover_thickness_m(settings)
        concrete_density = concrete_density_kg_m3(settings)
        concrete_cost_per_m3 = concrete_cost_per_m3_setting(settings)
        eps_cost_per_m3 = eps_cost_per_m3_setting(settings)
        slab_bruto_m3 = area_m2 * thickness
        if slab_mode == 'nervurada'
          volume_m3 = area_m2 * (fator_nervurado_m + capa_concreto_m)
          eps_volume_m3 = [slab_bruto_m3 - volume_m3, 0.0].max
        else
          volume_m3 = Cache.entity_volume(entity).to_f + (area_m2 * capa_concreto_m)
          eps_volume_m3 = 0.0
        end
        concrete_cost = volume_m3 * concrete_cost_per_m3
        eps_cost = eps_volume_m3 * eps_cost_per_m3
        slab_weight_kg = volume_m3 * concrete_density
        perfil_key = "SLAB|#{round_profile_value(thickness)}"
      when :wall
        thickness = sec_a
        height = world_z
        comprimento_m = plan_len
        secao_label = "Esp. #{Formatting.measure(thickness, :length, settings)} x Alt. #{Formatting.measure(height, :length, settings)}"
        comprimento_key = rounded_length_key(comprimento_m, settings)
        area_m2 = comprimento_m * height
        perfil_key = "WALL|#{round_profile_value(thickness)}|#{round_profile_value(height)}|#{round_profile_value(comprimento_m)}"
      when :foundation
        comprimento_m = 0.0
        comprimento_key = 'FOUNDATION'
        secao_label = "#{Formatting.measure(world_x, :length, settings)} x #{Formatting.measure(world_y, :length, settings)} x #{Formatting.measure(world_z, :length, settings)}"
        area_m2 = world_x * world_y
        perfil_key = "FOUND|#{round_profile_value(world_x)}|#{round_profile_value(world_y)}|#{round_profile_value(world_z)}"
      else
        comprimento_m = sec_c
        comprimento_key = rounded_length_key(comprimento_m, settings)
      end

      {
        tipo_estrutural: tipo_estrutural_from_ifc(normalized_ifc, entity),
        secao: secao_label,
        comprimento_m: comprimento_m,
        comprimento_key: comprimento_key,
        perfil_key: perfil_key,
        material: material_value,
        material_key: material_value,
        storey: storey_value,
        storey_key: storey_value,
        area_m2: area_m2,
        volume_m3: volume_m3,
        eps_volume_m3: eps_volume_m3,
        concrete_cost: concrete_cost,
        eps_cost: eps_cost,
        slab_weight_kg: slab_weight_kg
      }
    rescue StandardError
      {
        tipo_estrutural: tipo_estrutural_from_ifc(ifc_type || ''),
        secao: '0 x 0',
        comprimento_m: 0.0,
        comprimento_key: '0',
        perfil_key: 'GEN|0|0|0',
        material: 'NAO INFORMADO',
        material_key: 'NAO INFORMADO',
        storey: 'SEM PAVIMENTO',
        storey_key: 'SEM PAVIMENTO',
        area_m2: 0.0,
        volume_m3: 0.0,
        eps_volume_m3: 0.0,
        concrete_cost: 0.0,
        eps_cost: 0.0,
        slab_weight_kg: 0.0
      }
    end

    def ifc_structural_family(ifc_type)
      raw = ifc_type.to_s
      return :beam if raw.match?(/IfcBeam|IfcMember|IfcStairFlight|IfcRampFlight/i)
      return :column if raw.match?(/IfcColumn/i)
      return :slab if raw.match?(/IfcSlab|IfcRoof|IfcPlate|IfcCovering/i)
      return :wall if raw.match?(/IfcWall|IfcWallStandardCase|IfcCurtainWall/i)
      return :foundation if raw.match?(/IfcFooting|IfcPile/i)

      :other
    end

    def concrete_cover_thickness_m(settings)
      raw = settings[:concrete_cover_thickness_m]
      value = raw.is_a?(String) ? raw.tr(',', '.').to_f : raw.to_f
      value.negative? ? 0.0 : value
    rescue StandardError
      0.0
    end

    def slab_ribbed_factor_m(settings)
      raw = settings[:slab_ribbed_factor_m]
      value = raw.is_a?(String) ? raw.tr(',', '.').to_f : raw.to_f
      value.negative? ? 0.0 : value
    rescue StandardError
      0.10
    end

    def slab_mode_setting(settings)
      raw = settings[:slab_mode].to_s.strip.downcase
      raw == 'nervurada' ? 'nervurada' : 'convencional'
    rescue StandardError
      'nervurada'
    end

    def concrete_density_kg_m3(settings)
      value = numeric_setting(settings, :concrete_density_kg_m3, 2500.0)
      value.positive? ? value : 2500.0
    rescue StandardError
      2500.0
    end

    def concrete_cost_per_m3_setting(settings)
      value = numeric_setting(settings, :concrete_cost_per_m3, 0.0)
      value.negative? ? 0.0 : value
    rescue StandardError
      0.0
    end

    def eps_cost_per_m3_setting(settings)
      value = numeric_setting(settings, :eps_cost_per_m3, 0.0)
      value.negative? ? 0.0 : value
    rescue StandardError
      0.0
    end

    def numeric_setting(settings, key, default)
      raw = settings[key]
      return default.to_f if raw.nil?

      if raw.is_a?(String)
        txt = raw.strip
        return default.to_f if txt.empty?
        return txt.tr(',', '.').to_f
      end

      raw.to_f
    rescue StandardError
      default.to_f
    end

    def round_profile_value(value)
      value.to_f.round(4).to_s
    end

    def normalize_material(material)
      m = material.to_s.strip.upcase
      return 'NAO INFORMADO' if m.empty?
      return 'CONCRETO' if m.include?('CONC')
      return 'ACO' if m.include?('STEEL') || m.include?('ACO')

      m
    end

    def normalize_storey(storey)
      raw = storey.to_s.strip
      return 'SEM PAVIMENTO' if raw.empty?

      n = raw.upcase

      # Casos especiais antes de buscar número
      return 'TERREO' if n.match?(/T[EÉ]RREO|GROUND|GROUNDFLOOR|PISO\ 0\b|PAV\ 0\b|LEVEL\ 0\b/)

      # Extrai o primeiro número (suporta: Level 1, PAV 01, 1º Andar, Storey-2, etc.)
      num = n.scan(/\d+/).first
      return format('PAVIMENTO %02d', num.to_i) if num

      # Nome sem número reconhecível
      n
    end

    def material_for(entity)
      advanced_attribute_for(entity, %w[material material_name mat concretegrade grade steelclass class])
    end

    def storey_for(entity)
      pid = entity.persistent_id
      sig = storey_cache_signature(entity)
      cached = Cache.storey_cache[pid]
      return cached[:value] if cached && cached[:sig] == sig

      raw = detect_storey_raw(entity)
      result = normalize_storey(raw)
      Cache.storey_cache[pid] = { value: result, sig: sig }
      result
    rescue StandardError
      'SEM PAVIMENTO'
    end

    # Assinatura de cache robusta para storey:
    # - origem Z da transformação (mudança geométrica)
    # - fingerprint da hierarquia de instâncias (mudança semântica)
    def storey_cache_signature(entity)
      z_sig = entity.transformation.origin.z.to_f.round(4)
      path_sig = begin
        path = entity.respond_to?(:instance_path) ? entity.instance_path : nil
        if path
          path.to_a.map { |e| e.respond_to?(:persistent_id) ? e.persistent_id.to_i : 0 }.join('/')
        else
          ''
        end
      rescue StandardError
        ''
      end

      [z_sig, path_sig].hash
    end

    def detect_storey_raw(entity)
      # 1. Atributo direto no elemento
      value = advanced_attribute_for(entity, %w[storey buildingstorey level pavimento floor])
      return value unless value.to_s.strip.empty?

      # 2. Hierarquia IFC: sobe o instance_path procurando o IfcBuildingStorey pai.
      #    Em modelos IFC reais: IfcProject → IfcSite → IfcBuilding → IfcBuildingStorey → IfcBeam
      storey_from_path = storey_from_instance_path(entity)
      return storey_from_path unless storey_from_path.empty?

      # 3. Fallback: nome da layer
      entity.layer ? entity.layer.name.to_s : ''
    end

    # Percorre os ancestrais do elemento no modelo IFC procurando um IfcBuildingStorey.
    # Retorna o nome do pavimento, ou string vazia se não encontrado.
    def storey_from_instance_path(entity)
      # instance_path disponível no SketchUp >= 2017 para ComponentInstances
      return '' unless entity.respond_to?(:instance_path)

      path = entity.instance_path rescue nil
      return 'SEM PAVIMENTO' if path.nil?

      # Itera do mais próximo ao mais distante (exclui o próprio entity)
      path.to_a.reverse.each do |ancestor|
        next if ancestor == entity
        next unless ancestor.is_a?(Sketchup::ComponentInstance) || ancestor.is_a?(Sketchup::Group)

        ifc_source = ancestor.is_a?(Sketchup::Group) ? ancestor : ancestor.definition
        ifc = ifc_type_from_applied_schema(ifc_source)
        next unless ifc.casecmp('IfcBuildingStorey').zero?

        # Tenta: nome da instância → atributo Name/LongName → nome da definição
        name = ancestor.name.to_s.strip
        name = advanced_attribute_for(ancestor, %w[name longname storey]) if name.empty?
        name = ancestor.definition.name.to_s.strip if name.empty?
        return name unless name.empty?
      end

      ''
    rescue StandardError
      ''
    end

    def rounded_length_key(length_m, settings)
      decimals = Formatting.decimals_from_pattern(settings[:round_length])
      format("%.#{decimals}f", length_m.to_f)
    rescue StandardError
      length_m.to_f.round(3).to_s
    end

    def build_group_row(group_key, bucket, settings)
      group_id = group_hash_id(group_key)
      length_repr = bucket[:comprimento_m]
      area_total = bucket[:area_total_m2]
      volume_total = bucket[:volume_total_m3]
      ml_total = bucket[:metro_linear_total_m]
      eps_volume_total = bucket[:eps_volume_total_m3].to_f
      concrete_cost_total = bucket[:concrete_cost_total].to_f
      eps_cost_total = bucket[:eps_cost_total].to_f
      slab_weight_total = bucket[:slab_weight_total_kg].to_f
      qty = bucket[:quantidade]

      {
        id: group_row_id(group_key),
        group_id: group_id,
        group_key: group_key,
        is_group: true,

        ifc: bucket[:ifc],
        tipo: bucket[:tipo],
        secao: bucket[:secao],
        material: bucket[:material].to_s,
        storey: bucket[:storey].to_s,
        comprimento: Formatting.measure(length_repr, :length, settings),
        quantidade: qty,
        metro_linear_total: Formatting.measure(ml_total, :length, settings),
        volume_total: Formatting.measure(volume_total, :volume, settings),
        area_total: Formatting.measure(area_total, :area, settings),
        eps_volume_total: eps_volume_total,
        concrete_cost_total: concrete_cost_total,
        eps_cost_total: eps_cost_total,
        slab_weight_total_kg: slab_weight_total,
        instancias: bucket[:instancias],

        ordinal: '',
        image: '',
        entity: 'Grupo',
        definition: "#{bucket[:ifc]} | #{bucket[:tipo]}",
        instance: "#{qty} instancias",
        description: "Secao #{bucket[:secao]}",
        len_x: '',
        len_y: '',
        len_z: '',
        len_xz: '',
        len_xy: bucket[:secao],
        len_xyz: Formatting.measure(length_repr, :length, settings),
        area_xz: '',
        area_xy: Formatting.measure(area_total, :area, settings),
        area: Formatting.measure(area_total, :area, settings),
        volume: Formatting.measure(volume_total, :volume, settings),
        eps_volume_m3: eps_volume_total,
        concrete_cost: concrete_cost_total,
        eps_cost: eps_cost_total,
        slab_weight_kg: slab_weight_total,
        tag: bucket[:tag].to_s,
        status: '',
        owner: '',
        url: '',
        size: '',
        price: '',
        custom: '',
        quantity: qty,
        total: qty
      }
    end

    def group_hash_id(group_key)
      Zlib.crc32(group_key.to_s).to_s(16)
    end

    def group_row_id(group_key)
      "grp-#{group_hash_id(group_key)}-group"
    end

    def grouping_signature(entities, settings, custom_key)
      identity = entities.map do |entity|
        bounds = entity.bounds
        bounds_signature = [
          bounds.min.x.to_f.round(6), bounds.min.y.to_f.round(6), bounds.min.z.to_f.round(6),
          bounds.max.x.to_f.round(6), bounds.max.y.to_f.round(6), bounds.max.z.to_f.round(6)
        ].join(',')

        [
          entity.persistent_id,
          entity.definition.persistent_id,
          entity.name.to_s,
          entity.definition.name.to_s,
          entity.layer&.name.to_s,
          normalize_material(material_for(entity)),
          normalize_storey(storey_for(entity)),
          entity.transformation.to_a.map { |n| n.to_f.round(8) }.join(','),
          bounds_signature
        ].join(':')
      end.sort.join(';')

      [
        settings[:round_length], settings[:format_length],
        settings[:round_area], settings[:format_area],
        settings[:round_volume], settings[:format_volume],
        settings[:decimal_separator],
        settings[:concrete_cover_thickness_m],
        settings[:slab_mode],
        settings[:slab_ribbed_factor_m],
        settings[:concrete_density_kg_m3],
        settings[:concrete_cost_per_m3],
        settings[:eps_cost_per_m3],
        custom_key.to_s,
        identity
      ].join('|')
    end

    def smart_definition_name(entity, ifc_type, definition)
      def_name = definition.name.to_s.strip
      inst_name = entity.name.to_s.strip

      return def_name unless guid_like_name?(def_name)
      return inst_name unless inst_name.empty?
      return ifc_type unless ifc_type.to_s.strip.empty?

      def_name
    end

    def guid_like_name?(name)
      value = name.to_s.strip
      return false if value.empty?
      return false if value.start_with?('Ifc')
      return false if value.include?(' ') || value.include?('-')

      # Typical IFC/GUID-like opaque token, e.g. 3g0eeKYr8HxuZpT5OyAyQG
      value.match?(/\A[A-Za-z0-9_]{20,}\z/)
    end

    def display_name_for(entity)
      name = entity.name.to_s.strip
      return name unless name.empty?

      definition_name = entity.definition.name.to_s.strip
      return definition_name unless definition_name.empty?

      "Elemento #{entity.entityID}"
    end

    def collect_dynamic_keys(model)
      selected_entities(model).flat_map do |entity|
        dynamic_attribute_hash(entity).keys
      end.uniq.sort
    end

    def dynamic_attribute_hash(entity)
      result = {}
      [entity, entity.definition].compact.each do |source|
        dict = source.attribute_dictionary('dynamic_attributes', false)
        next unless dict

        dict.each_pair do |key, value|
          next if key.to_s.start_with?('_')
          next if value.nil? || value.to_s.strip.empty?

          result[key.to_s] = value.to_s
        end
    end
      result
    end

    def dynamic_value_for(entity, key)
      dynamic_attribute_hash(entity)[key.to_s].to_s
    end

    def ifc_type_for(entity)
      [entity, entity.definition].compact.each do |source|
        applied_schema_type = ifc_type_from_applied_schema(source)
        return applied_schema_type unless applied_schema_type.empty?

        dicts = source.attribute_dictionaries
        next unless dicts

        IFC_DICT_NAMES.each do |dict_name|
          dict = dicts[dict_name]
          next unless dict

          IFC_TYPE_KEYS.each do |type_key|
            valid = normalize_ifc_type(dict[type_key].to_s)
            return valid unless valid.empty?
          end
        end

        dicts.each do |dict|
          next unless dict.name.to_s.start_with?('SU_')

          %w[IFC\ Type IfcObjectType ObjectType].each do |key|
            valid = normalize_ifc_type(dict[key].to_s)
            return valid unless valid.empty?
          end
        end
      end

      definition_name = entity.definition.name.to_s.upcase
      VALID_IFC_TYPES.each do |ifc_type|
        return ifc_type if definition_name.include?(ifc_type.upcase)
      end

      ''
    end

    def ifc_type_from_applied_schema(source)
      dict = source.attribute_dictionary('AppliedSchemaTypes', false)
      return '' unless dict

      dict.each_pair do |_schema, raw_type|
        normalized = normalize_ifc_type(raw_type.to_s)
        return normalized unless normalized.empty?
      end

      ''
    rescue StandardError
      ''
    end

    def normalize_ifc_type(raw)
      val = raw.to_s.strip
      return '' if val.empty?

      exact = VALID_IFC_TYPES.find { |known| known.casecmp(val).zero? }
      return exact if exact

      tokens = val.scan(/Ifc[A-Za-z0-9_]+/)
      token_match = tokens.find { |t| VALID_IFC_TYPES.any? { |known| known.casecmp(t).zero? } }
      return '' unless token_match

      VALID_IFC_TYPES.find { |known| known.casecmp(token_match).zero? } || ''
    end

    def advanced_attribute_for(entity, candidates)
      [entity, entity.definition].compact.each do |source|
        dicts = source.attribute_dictionaries
        next unless dicts

        dicts.each do |dict|
          dict.each_pair do |key, value|
            next if value.nil? || value.to_s.strip.empty?

            normalized_key = key.to_s.downcase
            return value.to_s if candidates.include?(normalized_key)
            return value.to_s if candidates.any? { |candidate| normalized_key.include?(candidate) }
          end
        end
      end
      ''
    end

    def image_url_for(entity)
      advanced_attribute_for(entity, %w[image image_url img picture photo thumbnail])
    end

    def description_for(entity)
      if entity.respond_to?(:description) && !entity.description.to_s.strip.empty?
        return entity.description.to_s
      end

      entity.definition.description.to_s
    end

    def sanitize_url(value)
      val = value.to_s.strip
      return '' if val.empty?
      return val if val.start_with?('/')

      if val =~ %r{\Ahttps?://}i
        val
      else
        ''
      end
    end

    def safe_text(value)
      value.to_s
    end

    def resolve_tag(entity)
      tag = entity.layer&.name.to_s.strip
      return tag unless generic_or_empty_tag?(tag)

      detected = auto_detect_tag(entity)
      return detected unless detected.empty?

      ifc = ifc_type_for(entity)
      mapped_tag = map_ifc_to_tag(ifc)
      return mapped_tag if mapped_tag

      return ifc unless ifc.to_s.strip.empty?

      'SEM TAG'
    end

    def auto_detect_tag(entity)
      return '' unless defined?(RelatorioPRO::TagDetector)

      detected = RelatorioPRO::TagDetector.detect_tag(entity).to_s.strip
      return '' if detected.empty?

      normalized = detected.upcase.tr(' ', '_')
      return '' if %w[OUTROS SEM_TAG ERRO].include?(normalized)

      detected
    rescue StandardError
      ''
    end

    def generic_or_empty_tag?(tag)
      value = tag.to_s.strip
      return true if value.empty?

      normalized = value.downcase
      generic_tags = [
        'layer0', 'tag0', 'untagged', 'default',
        'sem tag', 'sem_tag', 'sem etiqueta'
      ]

      generic_tags.include?(normalized)
    end

    def map_ifc_to_tag(ifc_type)
      return nil if ifc_type.to_s.strip.empty?

      ifc_upper = ifc_type.to_s.upcase
      
      case ifc_upper
      when /IFCBEAM/
        'VIGA'
      when /IFCCOLUMN/
        'PILAR'
      when /IFCSLAB/
        'LAJE'
      when /IFCWALL|IFCWALLSTANDARDCASE|IFCCURTAINWALL/
        'PAREDE'
      when /IFCROOF|IFCCOVERING/
        'COBERTURA'
      when /IFCFOOTING|IFCPILE/
        'FUNDACAO'
      when /IFCDOOR/
        'PORTA'
      when /IFCWINDOW/
        'JANELA'
      when /IFCSTAIR|IFCSTAIRFLIGHT/
        'ESCADA'
      when /IFCRAMP|IFCRAMPFLIGHT/
        'RAMPA'
      else
        nil
      end
    end
  end

  module Core
    module_function

    def grouped_mode_enabled?
      raw = Sketchup.read_default(PLUGIN_ID, 'group_mode', true)
      !(raw.to_s.strip.downcase == 'false' || raw == false)
    rescue StandardError
      true
    end

    def log_error(context, error)
      $stderr.puts("RelatorioPRO #{context}: #{error.class} - #{error.message}")
    end

    def dialog_visible?
      UI.dialog_visible?
    end

    def save_setting(key, value)
      Sketchup.write_default(PLUGIN_ID, key.to_s, value)
      Cache.invalidate!
      refresh_dialog
    rescue StandardError => e
      log_error('save_setting', e)
    end

    def schedule_refresh
      return unless dialog_visible?
      return if @refresh_pending

      @refresh_pending = true
      UI.start_timer(0.05, false) do
        @refresh_pending = false
        Cache.invalidate_geometry!
        refresh_dialog
      rescue StandardError => e
        @refresh_pending = false
        log_error('schedule_refresh', e)
      end
    end

    def refresh_dialog
      return unless dialog_visible?

      model = Sketchup.active_model
      settings = Cache.settings
      dynamic_keys = Data.collect_dynamic_keys(model)
      custom_key = Sketchup.read_default(PLUGIN_ID, 'custom_key', dynamic_keys.first || 'Name')
      ifc_summary = Data.ifc_summary_for_model(model)

      rows = if grouped_mode_enabled?
               Data.group_entities_pro(model, settings, custom_key)
             else
               Data.collect_rows(model, settings, custom_key)
             end
      tags = model.layers.map(&:name).sort

      script = "updateData(#{JSON.generate(rows)}, #{JSON.generate(settings)}, #{JSON.generate(tags)}, #{JSON.generate(dynamic_keys)}, #{JSON.generate([custom_key])}, #{JSON.generate(ifc_summary)})"
      UI.execute_script(script)
    rescue StandardError => e
      log_error('refresh_dialog', e)
    end

    def push_entity_update(entity)
      return unless dialog_visible?
      return unless entity&.valid?
      return unless selected_entity?(entity)

      settings = Cache.settings
      model = Sketchup.active_model

      rows = if grouped_mode_enabled?
               Data.group_updates_for_entity(model, entity, settings)
             else
               dynamic_keys = Data.collect_dynamic_keys(model)
               custom_key = Sketchup.read_default(PLUGIN_ID, 'custom_key', dynamic_keys.first || 'Name')
               [Data.build_row(entity, settings, custom_key)]
             end

      script = "updateRowsIncremental(#{JSON.generate(rows)})"
      UI.execute_script(script)
    rescue StandardError => e
      log_error('push_entity_update', e)
    end

    def selected_entity?(entity)
      return false unless entity&.valid?

      ifc = Data.ifc_type_for(entity)
      !ifc.empty? && IFC_PHYSICAL_TYPES.any? { |t| t.casecmp(ifc).zero? }
    rescue StandardError
      false
    end

    def highlight_object(object_id)
      entity = find_entity(object_id)
      return unless entity

      selection = Sketchup.active_model.selection
      selection.clear
      selection.add(entity)
    rescue StandardError => e
      log_error('highlight_object', e)
    end

    def zoom_selection
      model = Sketchup.active_model
      return if model.selection.empty?

      entities = model.selection.to_a
      aggregated_bb = entities.each_with_object(Geom::BoundingBox.new) { |ent, box| box.add(ent.bounds) }
      return if aggregated_bb.empty?

      view = model.active_view
      camera = view.camera
      center = aggregated_bb.center
      diagonal = aggregated_bb.diagonal

      fov_rad = camera.fov.to_f * Math::PI / 180.0
      safe_fov = [[fov_rad, 0.3].max, 2.6].min
      distance = (diagonal / 2.0) / Math.tan(safe_fov / 2.0)
      distance *= 1.20

      new_eye = center.offset(camera.direction.reverse, distance)
      camera.set(new_eye, center, camera.up)
      view.invalidate
      view.zoom(entities)
    rescue StandardError
      model.active_view.zoom(model.selection.to_a) unless model.selection.empty?
    end

    def focus_entity(pid)
      model = Sketchup.active_model
      entity = model.find_entity_by_persistent_id(pid.to_i)
      return unless entity

      model.selection.clear
      model.selection.add(entity)
      model.active_view.zoom(entity)
    rescue StandardError => e
      log_error('focus_entity', e)
    end

    def change_value(object_id, key, value)
      entity = find_entity(object_id)
      return unless entity

      safe_value = normalize_user_value(key, value)
      return if safe_value.nil?

      model = Sketchup.active_model
      model.start_operation('Atualizar Relatorio PRO', true, false, false)

      case key.to_s
      when 'definition'
        safe_update_definition(entity, safe_value)
      when 'instance'
        entity.name = safe_value if entity.respond_to?(:name=)
      when 'description'
        if entity.respond_to?(:description=)
          entity.description = safe_value
        else
          entity.definition.description = safe_value
        end
      when 'tag'
        layer = model.layers[safe_value]
        entity.layer = layer if layer
      else
        entity.set_attribute(PLUGIN_ID, key.to_s, safe_value)
      end

      model.commit_operation
      Cache.invalidate_row(entity)
      Cache.invalidate_geometry!
      push_entity_update(entity)
    rescue StandardError => e
      model&.abort_operation
      log_error('change_value', e)
      refresh_dialog
    end

    def safe_update_definition(entity, new_name)
      definition = entity.definition

      if definition.instances.length > 1 && entity.respond_to?(:make_unique)
        entity.make_unique
        definition = entity.definition
      end

      definition.name = new_name
    end

    def normalize_user_value(key, value)
      val = value.to_s.strip
      return '' if val.empty?

      return Data.sanitize_url(val) if key.to_s == 'url' || key.to_s == 'image'

      val
    end

    def find_entity(object_id)
      Sketchup.active_model.find_entity_by_persistent_id(object_id.to_i)
    rescue StandardError
      nil
    end

    def on_model_change(model)
      Cache.invalidate!
      Observer.detach_selection_observer
      Observer.attach_selection_observer_to(model)
      schedule_refresh
    rescue StandardError => e
      log_error('on_model_change', e)
    end
  end

  module Observer
    class SelectionWatcher < Sketchup::SelectionObserver
      def onSelectionAdded(_selection, _entity)
        RelatorioPRO::Core.schedule_refresh
      end

      def onSelectionRemoved(_selection, _entity)
        RelatorioPRO::Core.schedule_refresh
      end

      def onSelectionBulkChange(_selection)
        RelatorioPRO::Core.schedule_refresh
      end

      def onSelectionCleared(_selection)
        RelatorioPRO::Core.schedule_refresh
      end
    end

    class ModelWatcher < Sketchup::AppObserver
      def onNewModel(model)
        RelatorioPRO::Core.on_model_change(model)
      end

      def onOpenModel(model)
        RelatorioPRO::Core.on_model_change(model)
      end

      # Compatibilidade com versões que disparam activate model em MDI
      def onActivateModel(model)
        RelatorioPRO::Core.on_model_change(model)
      end
    end

    module_function

    def attach_selection_observer
      attach_selection_observer_to(Sketchup.active_model)
    end

    def attach_selection_observer_to(model)
      return if @selection_observer_attached && @observed_model == model

      detach_selection_observer
      @selection_observer ||= SelectionWatcher.new
      model.selection.add_observer(@selection_observer)
      @observed_model = model
      @selection_observer_attached = true
    rescue StandardError => e
      RelatorioPRO::Core.log_error('attach_selection_observer', e)
    end

    def detach_selection_observer
      return unless @selection_observer && @selection_observer_attached && @observed_model

      @observed_model.selection.remove_observer(@selection_observer)
      @selection_observer_attached = false
      @observed_model = nil
    rescue StandardError
      @selection_observer_attached = false
      @observed_model = nil
    end

    def attach_app_observer
      return if defined?(@app_observer) && @app_observer

      @app_observer = ModelWatcher.new
      Sketchup.add_observer(@app_observer)
    rescue StandardError => e
      RelatorioPRO::Core.log_error('attach_app_observer', e)
    end
  end

  module UI
    module_function

    def dialog_visible?
      defined?(@dialog) && @dialog && @dialog.visible?
    end

    def execute_script(script)
      @dialog.execute_script(script) if dialog_visible?
    rescue StandardError => e
      RelatorioPRO::Core.log_error('execute_script', e)
    end

    def start_timer(seconds, repeat, &block)
      ::UI.start_timer(seconds, repeat, &block)
    end

    def open_dialog
      if dialog_visible?
        @dialog.bring_to_front
        RelatorioPRO::Core.schedule_refresh
        return
      end

      @dialog = ::UI::HtmlDialog.new(
        dialog_title: COMMAND_NAME,
        width: 1480,
        height: 920,
        min_width: 1100,
        min_height: 700,
        style: ::UI::HtmlDialog::STYLE_DIALOG
      )

      @dialog.set_file(File.join(__dir__, 'dialog.html'))
      register_callbacks(@dialog)
      @dialog.set_on_closed do
        Observer.detach_selection_observer
        @dialog = nil
      end

      Observer.attach_selection_observer
      @dialog.show
    rescue StandardError => e
      RelatorioPRO::Core.log_error('open_dialog', e)
    end

    def register_callbacks(dialog)
      dialog.add_action_callback('ready') do |_ctx|
        Observer.attach_selection_observer
        RelatorioPRO::Core.refresh_dialog
      end

      dialog.add_action_callback('run_full_pipeline') do |_ctx|
        result =
          if RelatorioPRO.respond_to?(:run_full_pipeline)
            RelatorioPRO.run_full_pipeline
          else
            { success: false, error: 'run_full_pipeline indisponivel no runtime atual' }
          end

        payload = JSON.generate(result)
        dialog.execute_script("window.dispatchEvent(new CustomEvent('relatoriopro:pipelineFinished', { detail: #{payload} }));")
      end

      # Compatibilidade com fluxo antigo que chama request_data.
      dialog.add_action_callback('request_data') do |_ctx|
        result =
          if RelatorioPRO.respond_to?(:run_full_pipeline)
            RelatorioPRO.run_full_pipeline
          else
            { success: false, error: 'run_full_pipeline indisponivel no runtime atual' }
          end

        payload = JSON.generate(result)
        dialog.execute_script("window.dispatchEvent(new CustomEvent('relatoriopro:pipelineFinished', { detail: #{payload} }));")
      end

      dialog.add_action_callback('highlight') do |_ctx, object_id|
        RelatorioPRO::Core.highlight_object(object_id)
      end

      dialog.add_action_callback('zoomSelection') do |_ctx|
        RelatorioPRO::Core.zoom_selection
      end

      dialog.add_action_callback('changeValue') do |_ctx, object_id, key, value|
        RelatorioPRO::Core.change_value(object_id, key, value)
      end

      dialog.add_action_callback('savedCustomKey') do |_ctx, custom_key|
        Sketchup.write_default(PLUGIN_ID, 'custom_key', custom_key.to_s)
        Cache.invalidate!
        RelatorioPRO::Core.refresh_dialog
      end

      dialog.add_action_callback('roundLength') do |_ctx, value|
        RelatorioPRO::Core.save_setting(:round_length, ROUND_OPTIONS[value.to_i] || DEFAULT_SETTINGS[:round_length])
      end

      dialog.add_action_callback('roundArea') do |_ctx, value|
        RelatorioPRO::Core.save_setting(:round_area, ROUND_OPTIONS[value.to_i] || DEFAULT_SETTINGS[:round_area])
      end

      dialog.add_action_callback('roundVolume') do |_ctx, value|
        RelatorioPRO::Core.save_setting(:round_volume, ROUND_OPTIONS[value.to_i] || DEFAULT_SETTINGS[:round_volume])
      end

      dialog.add_action_callback('formatLength') do |_ctx, value|
        RelatorioPRO::Core.save_setting(:format_length, LENGTH_OPTIONS[value.to_i] || DEFAULT_SETTINGS[:format_length])
      end

      dialog.add_action_callback('formatArea') do |_ctx, value|
        RelatorioPRO::Core.save_setting(:format_area, AREA_OPTIONS[value.to_i] || DEFAULT_SETTINGS[:format_area])
      end

      dialog.add_action_callback('formatVolume') do |_ctx, value|
        RelatorioPRO::Core.save_setting(:format_volume, VOLUME_OPTIONS[value.to_i] || DEFAULT_SETTINGS[:format_volume])
      end

      dialog.add_action_callback('decimalSeparator') do |_ctx, value|
        RelatorioPRO::Core.save_setting(:decimal_separator, value.to_s == ',' ? ',' : '.')
      end

      dialog.add_action_callback('concreteCoverThickness') do |_ctx, value|
        thickness_m = value.to_s.tr(',', '.').to_f
        thickness_m = 0.0 if thickness_m.negative?
        RelatorioPRO::Core.save_setting(:concrete_cover_thickness_m, thickness_m)
      end

      dialog.add_action_callback('slabMode') do |_ctx, value|
        mode = value.to_s.strip.downcase == 'nervurada' ? 'nervurada' : 'convencional'
        RelatorioPRO::Core.save_setting(:slab_mode, mode)
      end

      dialog.add_action_callback('slabRibbedFactor') do |_ctx, value|
        factor_m = value.to_s.tr(',', '.').to_f
        factor_m = 0.0 if factor_m.negative?
        RelatorioPRO::Core.save_setting(:slab_ribbed_factor_m, factor_m)
      end

      dialog.add_action_callback('concreteDensity') do |_ctx, value|
        density = value.to_s.tr(',', '.').to_f
        density = DEFAULT_SETTINGS[:concrete_density_kg_m3].to_f if density <= 0.0
        RelatorioPRO::Core.save_setting(:concrete_density_kg_m3, density)
      end

      dialog.add_action_callback('concreteCostPerM3') do |_ctx, value|
        cost = value.to_s.tr(',', '.').to_f
        cost = 0.0 if cost.negative?
        RelatorioPRO::Core.save_setting(:concrete_cost_per_m3, cost)
      end

      dialog.add_action_callback('epsCostPerM3') do |_ctx, value|
        cost = value.to_s.tr(',', '.').to_f
        cost = 0.0 if cost.negative?
        RelatorioPRO::Core.save_setting(:eps_cost_per_m3, cost)
      end

      dialog.add_action_callback('focus_entity') do |_ctx, pid|
        RelatorioPRO::Core.focus_entity(pid)
      end
    end

    def plugin_command
      return @plugin_command if defined?(@plugin_command) && @plugin_command

      cmd = ::UI::Command.new(COMMAND_NAME) { open_dialog }
      cmd.small_icon = icon_path('toolbar_main', small: true)
      cmd.large_icon = icon_path('toolbar_main', small: false)
      cmd.tooltip = COMMAND_NAME
      cmd.status_bar_text = 'Abrir relatorio automatico da selecao atual.'
      cmd.menu_text = COMMAND_NAME
      @plugin_command = cmd
    end

    def zoom_command
      return @zoom_command if defined?(@zoom_command) && @zoom_command

      cmd = ::UI::Command.new('Zoom Selecao') { RelatorioPRO::Core.zoom_selection }
      cmd.small_icon = icon_path('toolbar_zoom', small: true)
      cmd.large_icon = icon_path('toolbar_zoom', small: false)
      cmd.tooltip = 'Zoom Selecao'
      cmd.status_bar_text = 'Zoom para os objetos selecionados na cena.'
      @zoom_command = cmd
    end

    def refresh_command
      return @refresh_command if defined?(@refresh_command) && @refresh_command

      cmd = ::UI::Command.new('Atualizar Relatorio') { RelatorioPRO::Core.schedule_refresh }
      cmd.small_icon = icon_path('toolbar_refresh', small: true)
      cmd.large_icon = icon_path('toolbar_refresh', small: false)
      cmd.tooltip = 'Atualizar Relatorio'
      cmd.status_bar_text = 'Atualizar o relatorio com a selecao atual.'
      @refresh_command = cmd
    end

    def register_toolbar
      return @toolbar if defined?(@toolbar) && @toolbar

      ensure_icons
      toolbar = ::UI::Toolbar.new(TOOLBAR_NAME)
      toolbar.add_item(plugin_command)
      toolbar.add_separator
      toolbar.add_item(zoom_command)
      toolbar.add_item(refresh_command)
      toolbar.restore
      @toolbar = toolbar
    end

    def ensure_icons
      dir = File.join(__dir__, 'images')
      FileUtils.mkdir_p(dir) unless Dir.exist?(dir)

      {
        'toolbar_main' => :draw_main_icon,
        'toolbar_zoom' => :draw_zoom_icon,
        'toolbar_refresh' => :draw_refresh_icon
      }.each do |name, method_name|
        [24, 32].each do |size|
          path = File.join(dir, "#{name}_#{size}.png")
          next if File.exist?(path)

          write_png(path, size, size, send(method_name, size))
        end
      end
    rescue StandardError => e
      RelatorioPRO::Core.log_error('ensure_icons', e)
    end

    def icon_path(name, small: true)
      File.join(__dir__, 'images', "#{name}_#{small ? 24 : 32}.png")
    end

    def png_chunk(type, data)
      crc = Zlib.crc32(type + data)
      [data.bytesize].pack('N') + type + data + [crc].pack('N')
    end

    def write_png(path, width, height, pixels)
      require 'zlib'
      signature = "\x89PNG\r\n\x1a\n".b
      ihdr = png_chunk('IHDR', [width, height, 8, 2, 0, 0, 0].pack('NNCCCCC'))

      raw = ''.b
      height.times do |y|
        raw << "\x00".b
        width.times do |x|
          r, g, b = pixels[y * width + x]
          raw << [r, g, b].pack('CCC')
        end
      end

      idat = png_chunk('IDAT', Zlib::Deflate.deflate(raw, Zlib::BEST_COMPRESSION))
      iend = png_chunk('IEND', '')
      File.binwrite(path, signature + ihdr + idat + iend)
    end

    def draw_main_icon(size)
      bg = [0x19, 0x76, 0xD2]
      header = [0x0D, 0x47, 0xA1]
      white = [0xFF, 0xFF, 0xFF]
      pixels = []

      size.times do |y|
        size.times do |x|
          if x.zero? || x == size - 1 || y.zero? || y == size - 1
            pixels << white
          elsif y < (size * 0.28).round
            pixels << header
          elsif (y - (size * 0.53).round).abs <= 1 || (y - (size * 0.76).round).abs <= 1
            pixels << white
          elsif (x - (size * 0.42).round).abs <= 1
            pixels << white
          else
            pixels << bg
          end
        end
      end

      pixels
    end

    def draw_zoom_icon(size)
      bg = [0xF5, 0xF5, 0xF5]
      ink = [0x37, 0x47, 0x51]
      cx = size * 0.40
      cy = size * 0.40
      r_out = size * 0.32
      r_in = r_out - [2.5, size * 0.08].max
      hx1 = size * 0.57
      hy1 = size * 0.57
      hx2 = size * 0.88
      hy2 = size * 0.88
      hw = [2.0, size * 0.08].max

      pixels = []
      size.times do |y|
        size.times do |x|
          d = Math.sqrt((x - cx)**2 + (y - cy)**2)
          dx = hx2 - hx1
          dy = hy2 - hy1
          len2 = dx**2 + dy**2
          t = len2 > 0 ? ((x - hx1) * dx + (y - hy1) * dy) / len2 : -1
          on_handle = t >= 0 && t <= 1 && Math.sqrt((x - (hx1 + t * dx))**2 + (y - (hy1 + t * dy))**2) <= hw / 2.0

          pixels << ((d >= r_in && d <= r_out) || on_handle ? ink : bg)
        end
      end

      pixels
    end

    def draw_refresh_icon(size)
      bg = [0xF5, 0xF5, 0xF5]
      green = [0x27, 0xAE, 0x60]
      cx = size / 2.0
      cy = size / 2.0
      r_out = size * 0.40
      r_in = r_out - [2.5, size * 0.09].max
      gap = 0.45
      aw = size * 0.18

      pixels = []
      size.times do |y|
        size.times do |x|
          d = Math.sqrt((x - cx)**2 + (y - cy)**2)
          angle = Math.atan2(y - cy, x - cx)
          in_ring = d >= r_in && d <= r_out
          arc1 = angle > (-Math::PI + gap) && angle < -gap
          arc2 = angle > gap && angle < (Math::PI - gap)
          ah1 = (x - (cx + r_out * Math.cos(-gap))).abs + (y - (cy + r_out * Math.sin(-gap))).abs < aw
          ah2 = (x - (cx + r_out * Math.cos(Math::PI - gap))).abs + (y - (cy + r_out * Math.sin(Math::PI - gap))).abs < aw

          pixels << ((in_ring && (arc1 || arc2)) || ah1 || ah2 ? green : bg)
        end
      end

      pixels
    end
  end

  unless file_loaded?(__FILE__)
    ::UI.menu('Plugins').add_item(UI.plugin_command)

    menu = ::UI.menu('Plugins').add_submenu('RelatorioPRO')

    menu.add_item('Detectar Tags Automaticamente') do
      start_time = Time.now
      stats = TagDetector.detection_stats
      elapsed = (Time.now - start_time).round(2)
      total = stats[:total_elements].to_i

      message = "Deteccao concluida!\n\n"
      message += "Total de elementos: #{total}\n"
      message += "Cobertura: #{stats[:coverage]}%\n"
      message += "Tempo: #{elapsed}s\n\n"
      message += "Distribuicao:\n"

      stats[:distribution].each do |tag, count|
        percentage = total.positive? ? (count.to_f / total * 100).round(1) : 0.0
        message += "  - #{tag}: #{count} (#{percentage}%)\n"
      end

      ::UI.messagebox(message)
    end

    menu.add_item('Abrir Dashboard de Tags') do
      TagDashboard.export_dashboard_html
    end

    menu.add_separator

    menu.add_item('Estatisticas de Deteccao') do
      stats = TagDetector.detection_stats
      total = stats[:total_elements].to_i

      html = <<-HTML
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; color: #1f2937; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
            th { background-color: #4a9eff; color: white; }
            .metric { font-size: 24px; font-weight: bold; color: #4a9eff; }
          </style>
        </head>
        <body>
          <h1>Estatisticas de Deteccao de Tags</h1>

          <h2>Resumo Geral</h2>
          <p><span class="metric">#{total}</span> elementos analisados</p>
          <p><span class="metric">#{stats[:coverage]}%</span> de cobertura</p>
          <p><span class="metric">#{stats[:tags_found].size}</span> tags diferentes</p>

          <h2>Distribuicao por Tag</h2>
          <table>
            <tr><th>Tag</th><th>Quantidade</th><th>Percentual</th></tr>
      HTML

      stats[:distribution].each do |tag, count|
        percentage = total.positive? ? (count.to_f / total * 100).round(1) : 0.0
        html += "<tr><td>#{tag}</td><td>#{count}</td><td>#{percentage}%</td></tr>"
      end

      html += '</table></body></html>'

      dialog = ::UI::HtmlDialog.new(
        dialog_title: 'Estatisticas de Deteccao',
        width: 600,
        height: 500,
        resizable: true
      )

      dialog.set_html(html)
      dialog.show
    end

    menu.add_separator

    menu.add_item('Configurar Regras de Deteccao') do
      ::UI.messagebox("Funcionalidade em desenvolvimento!\n\nEm breve voce podera customizar as regras de deteccao.")
    end

    UI.register_toolbar
    Observer.attach_app_observer
    file_loaded(__FILE__)
  end

  module Logger
    LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }.freeze
    
    @level = :info
    
    class << self
      attr_accessor :level
      
      def debug(message, context = {})
        log(:debug, message, context)
      end
      
      def info(message, context = {})
        log(:info, message, context)
      end
      
      def warn(message, context = {})
        log(:warn, message, context)
      end
      
      def error(message, error = nil, context = {})
        full_context = context.merge(
          error_class: error&.class,
          error_message: error&.message,
          backtrace: error&.backtrace&.first(5)
        )
        log(:error, message, full_context)
      end
      
      private
      
      def log(level, message, context)
        return if LEVELS[level] < LEVELS[@level]
        
        timestamp = Time.now.strftime('%Y-%m-%d %H:%M:%S')
        formatted = "[#{timestamp}] [#{level.upcase}] #{message}"
        formatted += " | #{context.inspect}" unless context.empty?
        
        puts formatted
        
        # Opcional: Salvar em arquivo
        log_file = File.join(ENV['TEMP'] || '/tmp', 'relatorio_pro.log')
        File.open(log_file, 'a') { |f| f.puts(formatted) }
      rescue StandardError => e
        puts "Logger error: #{e.message}"
      end
    end
  end
end

module RelatorioPRO
  module BatchProcessor
    BATCH_SIZE = 100
    
    module_function
    
    def process_entities_in_batches(entities, &block)
      total = entities.size
      processed = 0
      results = []
      
      entities.each_slice(BATCH_SIZE) do |batch|
        batch_results = batch.map(&block)
        results.concat(batch_results)
        
        processed += batch.size
        progress = (processed.to_f / total * 100).round(1)
        
        # Atualizar UI a cada batch
        Sketchup.status_text = "Processando: #{progress}% (#{processed}/#{total})"
        
        # Permitir que a UI responda
        yield(batch_results, progress) if block_given?
      end
      
      Sketchup.status_text = "Concluído: #{total} elementos processados"
      results
    rescue StandardError => e
      Logger.error("Erro no processamento em lote", e, { processed: processed, total: total })
      raise
    end
    
    def parallel_compute_geometries(entities)
      # Para grandes conjuntos, calcular geometrias em paralelo
      return serial_compute(entities) if entities.size < 50
      
      require 'thread'
      
      queue = Queue.new
      entities.each { |entity| queue << entity }
      
      results = {}
      mutex = Mutex.new
      
      threads = Array.new([4, entities.size].min) do
        Thread.new do
          while !queue.empty?
            entity = queue.pop(true) rescue nil
            break unless entity
            
            area = Geometry.entity_surface_area_m2(entity)
            volume = Geometry.entity_volume_m3(entity)
            
            mutex.synchronize do
              results[entity.persistent_id] = { area: area, volume: volume }
            end
          end
        end
      end
      
      threads.each(&:join)
      results
    rescue ThreadError, StandardError => e
      Logger.warn("Falha no processamento paralelo, voltando para serial", { error: e.message })
      serial_compute(entities)
    end
    
    private
    
    def serial_compute(entities)
      entities.each_with_object({}) do |entity, memo|
        memo[entity.persistent_id] = {
          area: Geometry.entity_surface_area_m2(entity),
          volume: Geometry.entity_volume_m3(entity)
        }
      end
    end
  end
end

module RelatorioPRO
  module Validator
    module_function
    
    def validate_settings!(settings)
      errors = []
      
      # Validar fatores numéricos
      numeric_keys = [
        :concrete_cover_thickness_m,
        :slab_ribbed_factor_m,
        :concrete_density_kg_m3,
        :concrete_cost_per_m3,
        :eps_cost_per_m3
      ]
      
      numeric_keys.each do |key|
        value = settings[key]
        next if value.is_a?(Numeric) && value >= 0
        
        errors << "#{key} deve ser um número não-negativo (recebido: #{value.inspect})"
      end
      
      # Validar opções de formato
      unless ROUND_OPTIONS.key?(settings[:round_length]&.count('.') || 2)
        errors << "Formato de arredondamento inválido para comprimento"
      end
      
      unless LENGTH_OPTIONS.value?(settings[:format_length])
        errors << "Unidade de comprimento inválida: #{settings[:format_length]}"
      end
      
      # Validar modo de laje
      valid_slab_modes = ['nervurada', 'macica', 'mista']
      unless valid_slab_modes.include?(settings[:slab_mode])
        errors << "Modo de laje inválido: #{settings[:slab_mode]}"
      end
      
      raise ArgumentError, "Configurações inválidas:\n- #{errors.join("\n- ")}" unless errors.empty?
      
      true
    end
    
    def sanitize_entity_name(name)
      return 'Unnamed' if name.nil? || name.strip.empty?
      
      name.strip
          .gsub(/[<>:\"\/\\|?*]/, '_')  # Caracteres inválidos em nomes de arquivo
          .gsub(/\s+/, ' ')              # Múltiplos espaços
          .slice(0, 255)                 # Limite de comprimento
    end
    
    def validate_ifc_type(ifc_type)
      return nil if ifc_type.nil? || ifc_type.strip.empty?
      
      normalized = ifc_type.upcase.strip
      VALID_IFC_TYPES.include?(normalized) ? normalized : nil
    end
  end
end

module RelatorioPRO
  module TagDetector
    # Regras de detecção baseadas em múltiplos critérios
    TAG_DETECTION_RULES = {
      'LAJE' => {
        ifc_types: ['IfcSlab'],
        name_patterns: [/laje/i, /slab/i, /piso/i, /floor/i],
        geometry: ->(entity) { 
          dims = Geometry.local_dimensions_m(entity)
          dims[0] > dims[2] && dims[1] > dims[2] # Elemento predominantemente horizontal
        }
      },
      'VIGA' => {
        ifc_types: ['IfcBeam'],
        name_patterns: [/viga/i, /beam/i, /vb/i, /^v\d+/i],
        geometry: ->(entity) {
          dims = Geometry.local_dimensions_m(entity)
          max_dim = dims.max
          min_dim = dims.min
          max_dim > (min_dim * 4) # Elemento alongado
        }
      },
      'PILAR' => {
        ifc_types: ['IfcColumn'],
        name_patterns: [/pilar/i, /column/i, /coluna/i, /^p\d+/i],
        geometry: ->(entity) {
          dims = Geometry.local_dimensions_m(entity)
          dims[2] > dims[0] && dims[2] > dims[1] # Elemento vertical
        }
      },
      'FUNDAÇÃO' => {
        ifc_types: ['IfcFooting', 'IfcPile'],
        name_patterns: [
          /fundação/i, /fundacao/i, /footing/i, /sapata/i, 
          /bloco/i, /radier/i, /estaca/i, /pile/i, /baldrame/i
        ],
        geometry: ->(entity) {
          bounds = entity.bounds
          bounds.min.z < 0.5 # Elementos próximos ao solo
        }
      },
      'ALVENARIA' => {
        ifc_types: ['IfcWall', 'IfcWallStandardCase'],
        name_patterns: [
          /parede/i, /wall/i, /alvenaria/i, /divisória/i, 
          /divisoria/i, /muro/i
        ],
        geometry: ->(entity) {
          dims = Geometry.local_dimensions_m(entity)
          # Elemento vertical fino (altura > largura e espessura pequena)
          dims[2] > dims[0] && dims[2] > dims[1] && 
          (dims.min < 0.3) # Espessura típica de parede
        }
      },
      'COBERTURA' => {
        ifc_types: ['IfcRoof', 'IfcCovering'],
        name_patterns: [/cobertura/i, /roof/i, /telhado/i, /telha/i],
        geometry: ->(entity) {
          bounds = entity.bounds
          model_height = Sketchup.active_model.bounds.height
          bounds.min.z > (model_height * 0.7) # Elementos no topo
        }
      },
      'ESCADA' => {
        ifc_types: ['IfcStair', 'IfcStairFlight', 'IfcRamp', 'IfcRampFlight'],
        name_patterns: [/escada/i, /stair/i, /rampa/i, /ramp/i, /degrau/i],
        geometry: ->(entity) {
          # Escadas geralmente têm geometria complexa
          entity.definition.entities.grep(Sketchup::Face).count > 10
        }
      },
      'ESQUADRIA' => {
        ifc_types: ['IfcDoor', 'IfcWindow'],
        name_patterns: [
          /porta/i, /door/i, /janela/i, /window/i, 
          /basculante/i, /veneziana/i
        ],
        geometry: ->(entity) {
          dims = Geometry.local_dimensions_m(entity)
          dims.min < 0.1 # Elementos finos (portas/janelas)
        }
      }
    }.freeze
    
    module_function
    
    # Detecta a tag de um elemento baseado em múltiplos critérios
    def detect_tag(entity)
      return 'SEM_TAG' unless entity.is_a?(Sketchup::ComponentInstance) || entity.is_a?(Sketchup::Group)
      
      scores = {}
      
      TAG_DETECTION_RULES.each do |tag_name, rules|
        score = calculate_score(entity, rules)
        scores[tag_name] = score if score > 0
      end
      
      # Retorna a tag com maior score, ou 'OUTROS' se nenhuma atingir threshold
      best_match = scores.max_by { |_, score| score }
      best_match && best_match[1] >= 2 ? best_match[0] : 'OUTROS'
      
    rescue StandardError => e
      Logger.error("Erro ao detectar tag", e, { entity: entity.entityID })
      'ERRO'
    end
    
    # Detecta todas as tags do modelo atual
    def detect_all_tags(entities = nil)
      entities ||= Sketchup.active_model.active_entities
      
      tag_map = {}
      total = 0
      
      entities.each do |entity|
        next unless entity.is_a?(Sketchup::ComponentInstance) || entity.is_a?(Sketchup::Group)
        
        tag = detect_tag(entity)
        tag_map[entity.persistent_id] = tag
        total += 1
        
        # Atualizar status
        if total % 10 == 0
          Sketchup.status_text = "Detectando tags: #{total} elementos..."
        end
      end
      
      Sketchup.status_text = "Detecção concluída: #{total} elementos"
      Logger.info("Tags detectadas", { total: total, tags: tag_map.values.tally })
      
      tag_map
    end
    
    # Agrupa elementos por tag
    def group_by_tag(entities = nil)
      tag_map = detect_all_tags(entities)
      grouped = Hash.new { |h, k| h[k] = [] }
      
      tag_map.each do |entity_id, tag|
        entity = Sketchup.active_model.find_entity_by_persistent_id(entity_id)
        grouped[tag] << entity if entity
      end
      
      grouped
    end
    
    # Estatísticas de detecção
    def detection_stats(entities = nil)
      tag_map = detect_all_tags(entities)
      tag_counts = tag_map.values.tally
      
      {
        total_elements: tag_map.size,
        tags_found: tag_counts.keys.sort,
        distribution: tag_counts.sort_by { |_, count| -count }.to_h,
        coverage: ((tag_map.size - tag_counts.fetch('OUTROS', 0) - tag_counts.fetch('SEM_TAG', 0)).to_f / tag_map.size * 100).round(2)
      }
    end
    
    private
    
    def calculate_score(entity, rules)
      score = 0
      
      # 1. Verificar tipo IFC (peso: 3 pontos)
      ifc_type = Data.ifc_type_for(entity)
      if ifc_type && rules[:ifc_types]&.any? { |type| ifc_type.upcase.include?(type.upcase) }
        score += 3
      end
      
      # 2. Verificar nome/descrição (peso: 2 pontos)
      name = "#{entity.name} #{entity.definition.name} #{Data.description_for(entity)}".downcase
      if rules[:name_patterns]&.any? { |pattern| name.match?(pattern) }
        score += 2
      end
      
      # 3. Verificar geometria (peso: 1 ponto)
      if rules[:geometry]&.respond_to?(:call)
        begin
          score += 1 if rules[:geometry].call(entity)
        rescue StandardError
          # Ignora erros de geometria
        end
      end
      
      score
    rescue StandardError => e
      Logger.warn("Erro ao calcular score", { error: e.message })
      0
    end
  end
  
  # ============================================================================
  # INTEGRAÇÃO COM DASHBOARD
  # ============================================================================
  module TagDashboard
    module_function
    
    # Gera dados no formato do dashboard web
    def generate_dashboard_data(entities = nil)
      entities ||= Sketchup.active_model.active_entities
      grouped = TagDetector.group_by_tag(entities)
      settings = Cache.settings
      
      dashboard_data = {
        all: {
          elementos: 0,
          area: 0.0,
          volume: 0.0,
          ml: 0.0
        },
        tags: {}
      }
      
      grouped.each do |tag_name, tag_entities|
        tag_data = {
          elementos: tag_entities.size,
          area: 0.0,
          volume: 0.0,
          ml: 0.0,
          itens: []
        }
        
        tag_entities.each do |entity|
          area_m2 = Cache.entity_area(entity)
          volume_m3 = Cache.entity_volume(entity)
          dims = Geometry.local_dimensions_m(entity)
          ml = calculate_linear_meters(entity, dims)
          
          # Acumular totais da tag
          tag_data[:area] += area_m2
          tag_data[:volume] += volume_m3
          tag_data[:ml] += ml
          
          # Adicionar item
          tag_data[:itens] << {
            id: entity.persistent_id.to_s,
            nome: Data.display_name_for(entity),
            area: area_m2.round(2),
            volume: volume_m3.round(3),
            ml: ml.round(2)
          }
        end
        
        # Arredondar totais
        tag_data[:area] = tag_data[:area].round(2)
        tag_data[:volume] = tag_data[:volume].round(3)
        tag_data[:ml] = tag_data[:ml].round(2)
        
        dashboard_data[:tags][tag_name] = tag_data
        
        # Acumular no global
        dashboard_data[:all][:elementos] += tag_data[:elementos]
        dashboard_data[:all][:area] += tag_data[:area]
        dashboard_data[:all][:volume] += tag_data[:volume]
        dashboard_data[:all][:ml] += tag_data[:ml]
      end
      
      # Arredondar totais globais
      dashboard_data[:all][:area] = dashboard_data[:all][:area].round(2)
      dashboard_data[:all][:volume] = dashboard_data[:all][:volume].round(3)
      dashboard_data[:all][:ml] = dashboard_data[:all][:ml].round(2)
      
      dashboard_data
    end
    
    # Exporta dashboard para arquivo HTML
    def export_dashboard_html(output_path = nil)
      output_path ||= File.join(ENV['TEMP'] || '/tmp', 'relatorio_dashboard.html')
      
      # Gerar dados
      data = generate_dashboard_data
      data_json = JSON.generate(data)
      
      # Ler template do dashboard
      template_path = File.join(__dir__, 'dashboard_tag.html')
      
      unless File.exist?(template_path)
        UI.messagebox("Arquivo dashboard_tag.html não encontrado!")
        return nil
      end
      
      html_content = File.read(template_path)
      
      # Injetar dados reais
      html_content.gsub!(
        /window\.relatorioTagDashboard\s*=\s*\{[^}]*\}/m,
        "window.relatorioTagDashboard = #{data_json}"
      )
      
      # Salvar arquivo
      File.write(output_path, html_content)
      
      Logger.info("Dashboard exportado", { path: output_path, tags: data[:tags].keys.size })
      
      # Abrir no navegador
      UI.openURL("file:///#{output_path.gsub('\\', '/')}")
      
      output_path
    rescue StandardError => e
      Logger.error("Erro ao exportar dashboard", e)
      UI.messagebox("Erro ao exportar dashboard: #{e.message}")
      nil
    end
    
    private
    
    def calculate_linear_meters(entity, dims)
      # Para vigas e pilares, usar a maior dimensão
      tag = TagDetector.detect_tag(entity)
      
      case tag
      when 'VIGA', 'PILAR'
        dims.max
      else
        0.0
      end
    end
  end
end
