ONNX_DIR := third_party/onnxruntime-osx-arm64-1.18.1
ONNX_INCLUDE := $(ONNX_DIR)/include
ONNX_LIB := $(ONNX_DIR)/lib
ONNX_DYLIB := $(ONNX_LIB)/libonnxruntime.1.18.1.dylib

APP_BUNDLE := build/bin/vadcondense.app
APP_MACOS := $(APP_BUNDLE)/Contents/MacOS
CLI_BIN := build/bin/vadcondense-cli

export C_INCLUDE_PATH := $(abspath $(ONNX_INCLUDE))
export CGO_LDFLAGS := -L$(abspath $(ONNX_LIB)) -lonnxruntime -Wl,-rpath,@executable_path
export DYLD_LIBRARY_PATH := $(abspath $(ONNX_LIB))

.PHONY: all gui cli copy clean

all: gui cli

gui: $(ONNX_DYLIB)
	wails build
	mkdir -p $(APP_MACOS)
	cp $(ONNX_DYLIB) $(APP_MACOS)

cli:
	go build -o $(CLI_BIN) ./cmd/vadcondense-cli

copy: $(ONNX_DYLIB)
	mkdir -p $(APP_MACOS)
	cp $(ONNX_DYLIB) $(APP_MACOS)

clean:
	rm -rf build/bin