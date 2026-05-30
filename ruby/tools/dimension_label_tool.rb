# =============================================================================
# DimensionLabelTool — Overlay de bounding box + etiqueta de dimensoes
# =============================================================================
# Inspirado na feature do plugin 5D+ Auto Info.
# Desenha sobre o modelo SketchUp:
#   - Bounding box (12 arestas) pontilhado vermelho ao redor do elemento
#   - Etiqueta verde com texto "X x Y x Z" sobre o elemento
# =============================================================================

require "sketchup"

module RelatorioPRO
	module Tools
		class DimensionLabelTool
			INCH_TO_M = 0.0254

			def initialize
				@entities = []   # array de Sketchup::Entity
				@bounds_cache = nil
			end

			# === Lifecycle ==========================================================

			def activate
				view = Sketchup.active_model.active_view
				view.invalidate if view
			end

			def deactivate(view)
				view.invalidate if view
			end

			def resume(view)
				view.invalidate
			end

			def suspend(view)
				view.invalidate
			end

			# === Public API =========================================================

			# Define um ou mais entities para destacar e re-renderiza
			def set_entities(entities)
				@entities = (entities || []).compact.select { |e| e.respond_to?(:bounds) && e.valid? }
				@bounds_cache = compute_combined_bounds(@entities)
				view = Sketchup.active_model.active_view
				view.invalidate if view
			end

			def clear
				@entities = []
				@bounds_cache = nil
				view = Sketchup.active_model.active_view
				view.invalidate if view
			end

			# === Drawing ============================================================

			def draw(view)
				return if @entities.empty? || @bounds_cache.nil?

				draw_bounding_box(view, @bounds_cache)
				draw_label(view, @bounds_cache)
			end

			# === Internals ==========================================================

			def compute_combined_bounds(entities)
				return nil if entities.empty?

				bb = Geom::BoundingBox.new
				entities.each do |e|
					next unless e.respond_to?(:bounds) && e.valid?
					eb = world_bounds(e)
					bb.add(eb.min)
					bb.add(eb.max)
				end
				bb
			rescue StandardError
				nil
			end

			# Retorna bounds em coordenadas do mundo (aplicando a transformacao se aplicavel)
			def world_bounds(entity)
				if entity.respond_to?(:transformation) && entity.respond_to?(:definition) && entity.definition
					bb = entity.definition.bounds
					transform = entity.transformation
					world_bb = Geom::BoundingBox.new
					# 8 cantos do bb local transformados para mundo
					corners = [
						bb.min,
						Geom::Point3d.new(bb.max.x, bb.min.y, bb.min.z),
						Geom::Point3d.new(bb.min.x, bb.max.y, bb.min.z),
						Geom::Point3d.new(bb.min.x, bb.min.y, bb.max.z),
						Geom::Point3d.new(bb.max.x, bb.max.y, bb.min.z),
						Geom::Point3d.new(bb.max.x, bb.min.y, bb.max.z),
						Geom::Point3d.new(bb.min.x, bb.max.y, bb.max.z),
						bb.max
					]
					corners.each { |p| world_bb.add(p.transform(transform)) }
					world_bb
				else
					entity.bounds
				end
			rescue StandardError
				entity.bounds
			end

			def draw_bounding_box(view, bb)
				view.line_width = 2
				view.line_stipple = "-"      # tracejado
				view.drawing_color = Sketchup::Color.new(220, 38, 38)  # vermelho

				# 8 cantos
				min = bb.min
				max = bb.max
				c = [
					Geom::Point3d.new(min.x, min.y, min.z),  # 0
					Geom::Point3d.new(max.x, min.y, min.z),  # 1
					Geom::Point3d.new(max.x, max.y, min.z),  # 2
					Geom::Point3d.new(min.x, max.y, min.z),  # 3
					Geom::Point3d.new(min.x, min.y, max.z),  # 4
					Geom::Point3d.new(max.x, min.y, max.z),  # 5
					Geom::Point3d.new(max.x, max.y, max.z),  # 6
					Geom::Point3d.new(min.x, max.y, max.z)   # 7
				]

				# 12 arestas do cubo
				edges = [
					[0, 1], [1, 2], [2, 3], [3, 0],   # base
					[4, 5], [5, 6], [6, 7], [7, 4],   # topo
					[0, 4], [1, 5], [2, 6], [3, 7]    # verticais
				]
				edges.each do |a, b|
					view.draw_line(c[a], c[b])
				end

				view.line_stipple = ""  # reset
			end

			def draw_label(view, bb)
				# Texto X x Y x Z em metros
				x = (bb.width.to_f  * INCH_TO_M).round(2)
				y = (bb.depth.to_f  * INCH_TO_M).round(2)
				z = (bb.height.to_f * INCH_TO_M).round(2)
				text = format("%.2f x %.2f x %.2f m", x, y, z)

				# Centro do bounding box em 3D
				center = bb.center
				# Projetar para coordenadas 2D da tela
				screen_pt = view.screen_coords(center)

				# Desenha texto (API SketchUp draw_text aceita Point3d em screen coords)
				options = {
					:font           => "Arial",
					:size           => 14,
					:bold           => true,
					:color          => Sketchup::Color.new(255, 255, 255),
					:align          => TextAlignCenter
				}

				# Fundo verde atras do texto — simulamos com retangulo desenhado
				draw_label_background(view, screen_pt, text)

				view.draw_text(screen_pt, text, options)
			rescue StandardError => e
				# draw_text com options pode variar entre versoes. Fallback simples:
				begin
					view.draw_text(screen_pt, text)
				rescue
					nil
				end
			end

			def draw_label_background(view, screen_pt, text)
				# Estima largura do texto (aproximado: ~9px por char)
				w = text.length * 9 + 16
				h = 24
				x = screen_pt.x.to_f
				y = screen_pt.y.to_f

				p1 = Geom::Point3d.new(x - w / 2, y - h / 2, 0)
				p2 = Geom::Point3d.new(x + w / 2, y - h / 2, 0)
				p3 = Geom::Point3d.new(x + w / 2, y + h / 2, 0)
				p4 = Geom::Point3d.new(x - w / 2, y + h / 2, 0)

				view.drawing_color = Sketchup::Color.new(34, 197, 94, 220)  # verde
				view.draw2d(GL_QUADS, [p1, p2, p3, p4])

				# Borda
				view.line_width = 1
				view.drawing_color = Sketchup::Color.new(21, 128, 61)
				view.draw2d(GL_LINE_LOOP, [p1, p2, p3, p4])
			rescue StandardError
				nil
			end
		end
	end
end
