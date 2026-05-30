# =============================================================================
# console_ifc_summary.rb — Resumo de tipos IFC do modelo SketchUp
# =============================================================================
# Cole no Ruby Console:
#   load 'D:/dev/RelatorioPRO/ruby/console_ifc_summary.rb'
#
# Formato nativo SketchUp IFC 2x3:
#   dict name : "IFC 2x3"
#   key       : "SchemaType"
#   value     : "http://www.iai-tech.org/ifcXML/IFC2x3/FINAL:IfcColumn"
# =============================================================================

module IfcConsoleAudit
  INCH2_TO_M2 = 0.000_645_16
  INCH3_TO_M3 = 0.000_016_387_064
  IFC_SCHEMAS = ["IFC 2x3", "IFC 4", "IFC 4x3", "IFC 2x2"].freeze

  # Extrai o tipo IFC da URL armazenada pelo SketchUp
  # "http://www.iai-tech.org/ifcXML/IFC2x3/FINAL:IfcColumn" → "IfcColumn"
  def self.parse_ifc_type(raw)
    return nil unless raw
    parts = raw.to_s.split(":")
    candidate = parts.last.to_s.strip
    candidate.start_with?("Ifc") ? candidate : nil
  end

  # Lê o tipo IFC nativo da definição da entidade
  def self.native_ifc_type(entity)
    targets = []
    targets << entity.definition if entity.respond_to?(:definition) && entity.definition
    targets << entity

    targets.each do |target|
      next unless target.respond_to?(:attribute_dictionaries) && target.attribute_dictionaries
      IFC_SCHEMAS.each do |schema|
        dict = target.attribute_dictionaries[schema]
        next unless dict
        ifc = parse_ifc_type(dict["SchemaType"])
        return [schema, ifc] if ifc
      end
    end
    nil
  end

  # Fallback: inferência pelo nome da tag/layer
  IFC_TAG_MAP = {
    /laje.*cob|cobertura/i     => "IfcRoof",
    /laje/i                    => "IfcSlab",
    /viga/i                    => "IfcBeam",
    /pilar|coluna/i            => "IfcColumn",
    /parede|alvenar/i          => "IfcWall",
    /sapata|fundaçã|fundacao|arranque/i => "IfcFooting",
    /escada/i                  => "IfcStair",
    /janela/i                  => "IfcWindow",
    /porta/i                   => "IfcDoor",
    /rampa/i                   => "IfcRamp",
  }.freeze

  def self.infer_ifc_from_tag(tag)
    IFC_TAG_MAP.each { |pat, ifc| return ifc if tag.match?(pat) }
    "IfcBuildingElementProxy"
  end

  def self.collect_instances(entities, output = [], visited = Set.new)
    entities.each do |e|
      next unless e.respond_to?(:persistent_id)
      next if visited.include?(e.persistent_id)
      visited << e.persistent_id
      if e.is_a?(Sketchup::ComponentInstance) || e.is_a?(Sketchup::Group)
        output << e
        inner = e.is_a?(Sketchup::Group) ? e.entities : e.definition.entities
        collect_instances(inner, output, visited)
      end
    end
    output
  end

  def self.run
    model = Sketchup.active_model
    unless model
      puts "[IfcConsoleAudit] Nenhum modelo aberto."
      return
    end

    puts "\n" + "=" * 68
    puts "  AUDITORIA IFC — #{model.title.empty? ? '(sem título)' : model.title}"
    puts "=" * 68

    all = collect_instances(model.entities)
    puts "  Instâncias coletadas: #{all.size}\n"

    # ── Testar leitura nativa numa amostra ────────────────────────────────────
    sample_native = all.first(20).count { |e| native_ifc_type(e) }
    has_native = sample_native > 0
    puts "  Dados IFC nativos (SchemaType): #{has_native ? "✅ SIM" : "❌ NÃO — usando inferência por tag"}\n\n"

    # ── Acumular estatísticas ─────────────────────────────────────────────────
    by_ifc  = Hash.new { |h, k| h[k] = { count: 0, native: 0, tags: Hash.new(0), area: 0.0, volume: 0.0 } }
    by_tag  = Hash.new(0)

    all.each do |e|
      tag = (e.layer ? e.layer.name.to_s.strip : "")
      tag = "(SEM TAG)" if tag.empty? || tag == "Layer0"
      by_tag[tag] += 1

      native = native_ifc_type(e)
      ifc = if native
        by_ifc[native[1]][:native] += 1
        native[1]
      else
        infer_ifc_from_tag(tag)
      end

      by_ifc[ifc][:count]     += 1
      by_ifc[ifc][:tags][tag] += 1

      begin
        b = e.bounds
        by_ifc[ifc][:area]   += (b.width * b.depth).to_f * INCH2_TO_M2
        by_ifc[ifc][:volume] += (b.width * b.depth * b.height).to_f * INCH3_TO_M3
      rescue; end
    end

    # ── Tabela resumo por tipo IFC ─────────────────────────────────────────────
    puts "  RESUMO POR TIPO IFC:"
    puts "  #{"Tipo IFC":<30} #{"Qtd":>5}  #{"Nativos":>8}  #{"Área m²":>9}  #{"Vol m³":>9}"
    puts "  " + "-" * 68
    total = 0
    by_ifc.sort_by { |_, v| -v[:count] }.each do |ifc, d|
      src = d[:native] == d[:count] ? "✅" : d[:native] > 0 ? "〜" : "⚙"
      printf("  %-30s %5d  %8d  %9.2f  %9.3f  %s\n",
             ifc, d[:count], d[:native], d[:area], d[:volume], src)
      total += d[:count]
    end
    printf("  %-30s %5d\n", "TOTAL", total)

    # ── Por tag ────────────────────────────────────────────────────────────────
    puts "\n  POR TAG (Layer):"
    puts "  #{"Tag":<35} #{"Qtd":>5}  IFC"
    puts "  " + "-" * 60
    by_tag.sort_by { |_, v| -v }.each do |tag, count|
      printf("  %-35s %5d  %s\n", tag, count, infer_ifc_from_tag(tag))
    end

    # ── Detalhe: tags dentro de cada tipo IFC ─────────────────────────────────
    puts "\n  DETALHE POR TIPO:"
    by_ifc.sort_by { |_, v| -v[:count] }.each do |ifc, d|
      src = d[:native] > 0 ? " [nativo IFC 2x3]" : " [inferido por tag]"
      puts "  #{ifc}#{src} — #{d[:count]} elementos"
      d[:tags].sort_by { |_, v| -v }.each { |tag, cnt| printf("    %5dx  %s\n", cnt, tag) }
    end

    # ── Legenda ────────────────────────────────────────────────────────────────
    puts "\n  Legenda: ✅ 100% nativo  〜 parcial  ⚙ inferido por tag"
    puts "=" * 68 + "\n\n"
    nil
  end
end

Object.send(:remove_const, :IfcConsoleAudit) if Object.const_defined?(:IfcConsoleAudit)
load __FILE__
