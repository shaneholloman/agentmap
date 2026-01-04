// Example Zig module for testing agentmap.
// This file demonstrates various Zig constructs.

const std = @import("std");

pub const MAX_SIZE: usize = 1024;

pub fn add(a: i32, b: i32) i32 {
    // Add two numbers together
    // with overflow checking
    // and proper error handling
    // for edge cases
    // that might occur
    return a + b;
}

fn privateHelper() void {
    // This is a private function
    // that should not be exported
    // but should still be detected
    // as a definition
    // with multiple lines
    return;
}

pub const Config = struct {
    name: []const u8,
    value: i32,
    enabled: bool,

    pub fn init(name: []const u8) Config {
        return Config{
            .name = name,
            .value = 0,
            .enabled = true,
        };
    }
};

pub const Status = enum {
    pending,
    running,
    completed,
    failed,
};

pub const Result = union(enum) {
    ok: i32,
    err: []const u8,

    pub fn isOk(self: Result) bool {
        return self == .ok;
    }
};

test "add function" {
    // Test basic addition
    const result = add(2, 3);
    // Verify the result
    try std.testing.expect(result == 5);
    // Additional checks
    try std.testing.expect(add(0, 0) == 0);
}

test "config init" {
    const cfg = Config.init("test");
    try std.testing.expect(cfg.value == 0);
}
