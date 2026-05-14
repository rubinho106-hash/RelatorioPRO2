require_relative "python_bridge"
require_relative "ui"

module RelatorioPRO
	module_function

	def run_ifc_pipeline
		PythonBridge.run_extract_ifc
	end

	def run_grouping
		PythonBridge.run_grouping
	end

	def run_analytics
		PythonBridge.run_analytics
	end

	def run_full_pipeline
		PythonBridge.run_full_pipeline
	end

	def register_dialog_callbacks(dialog)
		UI.register_pipeline_callbacks(dialog)
	end
end
