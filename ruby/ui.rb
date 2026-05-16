require 'json'

module RelatorioPRO
	module UI
		module_function

		def register_pipeline_callbacks(dialog)
			return unless dialog

			dialog.add_action_callback('run_full_pipeline') do |_ctx|
				execute_pipeline_and_notify(dialog, :full)
			end
		end

		def execute_pipeline_and_notify(dialog, mode = :full)
			result =
				case mode
				when :extract_only
					RelatorioPRO.run_ifc_pipeline
				else
					RelatorioPRO.run_full_pipeline
				end

			notify_pipeline_finished(dialog, result)
			result
		rescue StandardError => e
			error_payload = {
				success: false,
				error: e.message
			}
			notify_pipeline_finished(dialog, error_payload)
			error_payload
		end

		def notify_pipeline_finished(dialog, result)
			payload = JSON.generate(result)
			script = "window.dispatchEvent(new CustomEvent('relatoriopro:pipelineFinished', { detail: #{payload} }));"
			dialog.execute_script(script)
		rescue StandardError
			nil
		end
	end
end
