#import <Foundation/Foundation.h>
#import <Security/Security.h>
#import <LocalAuthentication/LocalAuthentication.h>

static NSString *const Service = @"com.jingwei.local.deepseek";
static NSString *const Account = @"api-key";

static void emit(NSDictionary *result) {
    NSData *data = [NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
    [[NSFileHandle fileHandleWithStandardOutput] writeData:data];
}
static NSDictionary *input(void) {
    NSData *data = [[NSFileHandle fileHandleWithStandardInput] readDataToEndOfFile];
    if (data.length > 8192) return nil;
    id value = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
    return [value isKindOfClass:NSDictionary.class] ? value : nil;
}
static NSString *errorCode(OSStatus status) {
    if (status == errSecItemNotFound) return @"keychain_not_found";
    if (status == errSecUserCanceled) return @"keychain_cancelled";
    if (status == errSecInteractionNotAllowed || status == errSecAuthFailed) return @"keychain_access_required";
    return @"keychain_failed";
}
static NSMutableDictionary *query(NSString *service, SecKeychainRef keychain, BOOL interactive) {
    LAContext *context = [[LAContext alloc] init];
    context.interactionNotAllowed = !interactive;
    NSMutableDictionary *q = [@{(__bridge id)kSecClass:(__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrService:service, (__bridge id)kSecAttrAccount:Account,
        (__bridge id)kSecAttrSynchronizable:@NO,
        (__bridge id)kSecUseAuthenticationContext:context} mutableCopy];
    if (keychain) q[(__bridge id)kSecMatchSearchList] = @[(__bridge id)keychain];
    return q;
}
static OSStatus store(NSString *key, NSString *service, SecKeychainRef keychain) {
    NSMutableDictionary *q = query(service, keychain, YES);
    NSDictionary *changes = @{(__bridge id)kSecValueData:[key dataUsingEncoding:NSUTF8StringEncoding]};
    OSStatus status = SecItemUpdate((__bridge CFDictionaryRef)q, (__bridge CFDictionaryRef)changes);
    if (status != errSecItemNotFound) return status;
    [q removeObjectForKey:(__bridge id)kSecMatchSearchList];
    if (keychain) q[(__bridge id)kSecUseKeychain] = (__bridge id)keychain;
    q[(__bridge id)kSecAttrLabel] = @"经纬 · DeepSeek API Key";
    q[(__bridge id)kSecValueData] = changes[(__bridge id)kSecValueData];
    return SecItemAdd((__bridge CFDictionaryRef)q, NULL);
}
static OSStatus exists(NSString *service, SecKeychainRef keychain) {
    NSMutableDictionary *q = query(service, keychain, NO);
    q[(__bridge id)kSecReturnAttributes] = @YES; // Never return password data for status.
    q[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
    CFTypeRef attributes = NULL;
    OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)q, &attributes);
    if (attributes) CFRelease(attributes);
    return status;
}
static OSStatus readKey(NSString *service, SecKeychainRef keychain, BOOL interactive, NSString **key) {
    NSMutableDictionary *q = query(service, keychain, interactive);
    q[(__bridge id)kSecReturnData] = @YES;
    q[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
    CFTypeRef result = NULL;
    OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)q, &result);
    if (status == errSecSuccess && result) *key = [[NSString alloc] initWithData:(__bridge NSData *)result encoding:NSUTF8StringEncoding];
    if (result) CFRelease(result);
    return status;
}
static OSStatus removeKey(NSString *service, SecKeychainRef keychain, BOOL interactive) {
    return SecItemDelete((__bridge CFDictionaryRef)query(service, keychain, interactive));
}
static int selfTest(void) {
    // An isolated disposable keychain and non-secret marker; never the user's existing items.
    NSString *directory = [NSTemporaryDirectory() stringByAppendingPathComponent:[@"jingwei-keychain-test-" stringByAppendingString:NSUUID.UUID.UUIDString]];
    [[NSFileManager defaultManager] createDirectoryAtPath:directory withIntermediateDirectories:YES attributes:@{NSFilePosixPermissions:@0700} error:nil];
    NSString *path = [directory stringByAppendingPathComponent:@"isolated.keychain-db"];
    NSString *password = NSUUID.UUID.UUIDString;
    NSData *passwordData = [password dataUsingEncoding:NSUTF8StringEncoding];
    NSString *service = [@"com.jingwei.keychain.fixture." stringByAppendingString:NSUUID.UUID.UUIDString];
    NSString *marker = @"public-fixture-not-a-real-api-key";
    SecKeychainRef keychain = NULL;
    OSStatus status = SecKeychainCreate(path.fileSystemRepresentation, (UInt32)passwordData.length, passwordData.bytes, NO, NULL, &keychain);
    BOOL saved=NO, booleanStatus=NO, matches=NO, restarted=NO, updated=NO, deleted=NO, missing=NO;
    if (status == errSecSuccess) {
        status = store(marker, service, keychain); saved = status == errSecSuccess;
        booleanStatus = exists(service, keychain) == errSecSuccess;
        NSString *loaded = nil; matches = readKey(service, keychain, NO, &loaded) == errSecSuccess && [loaded isEqualToString:marker];
        NSTask *child = [[NSTask alloc] init];
        child.executableURL = [NSURL fileURLWithPath:NSProcessInfo.processInfo.arguments.firstObject];
        child.arguments = @[@"fixture-read"];
        NSPipe *inPipe = [NSPipe pipe], *outPipe = [NSPipe pipe];
        child.standardInput = inPipe; child.standardOutput = outPipe; child.standardError = [NSFileHandle fileHandleWithNullDevice];
        if ([child launchAndReturnError:nil]) {
            NSData *payload = [NSJSONSerialization dataWithJSONObject:@{ @"path":path, @"password":password, @"service":service } options:0 error:nil];
            [inPipe.fileHandleForWriting writeData:payload]; [inPipe.fileHandleForWriting closeFile];
            id report = [NSJSONSerialization JSONObjectWithData:[outPipe.fileHandleForReading readDataToEndOfFile] options:0 error:nil];
            [child waitUntilExit]; restarted = child.terminationStatus == 0 && [report[@"matches"] boolValue];
        }
        updated = store(@"public-updated-fixture", service, keychain) == errSecSuccess;
        deleted = removeKey(service, keychain, NO) == errSecSuccess;
        missing = exists(service, keychain) == errSecItemNotFound;
    }
    BOOL cleaned = keychain && SecKeychainDelete(keychain) == errSecSuccess;
    if (keychain) CFRelease(keychain);
    [[NSFileManager defaultManager] removeItemAtPath:directory error:nil];
    BOOL ok = saved && booleanStatus && matches && restarted && updated && deleted && missing && cleaned;
    emit(@{ @"ok":@(ok), @"saved":@(saved), @"boolean_status":@(booleanStatus), @"read_matches":@(matches), @"restart_restored":@(restarted), @"updated":@(updated), @"deleted":@(deleted), @"missing_after_delete":@(missing), @"cleaned":@(cleaned), @"os_status":@(status), @"real_credentials_used":@NO });
    return ok ? 0 : 1;
}
int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc != 2) { emit(@{ @"error":@"invalid_operation" }); return 1; }
        NSString *operation = @(argv[1]);
        BOOL interactive = [@[@"save", @"delete", @"load-interactive"] containsObject:operation];
        SecKeychainSetUserInteractionAllowed(interactive); // Per helper process; never auto-accept a prompt.
        if ([operation isEqualToString:@"self-test"]) return selfTest();
        if ([operation isEqualToString:@"fixture-read"]) {
            NSDictionary *payload = input(); NSString *path = payload[@"path"], *service = payload[@"service"], *password = payload[@"password"];
            if (![path isKindOfClass:NSString.class] || ![path hasPrefix:NSTemporaryDirectory()] || ![path containsString:@"jingwei-keychain-test-"] || ![path.lastPathComponent isEqualToString:@"isolated.keychain-db"] || ![service hasPrefix:@"com.jingwei.keychain.fixture."] || ![password isKindOfClass:NSString.class]) { emit(@{ @"matches":@NO }); return 1; }
            SecKeychainRef keychain = NULL; NSString *loaded = nil;
            OSStatus status = SecKeychainOpen(path.fileSystemRepresentation, &keychain);
            NSData *bytes = [password dataUsingEncoding:NSUTF8StringEncoding];
            if (status == errSecSuccess) status = SecKeychainUnlock(keychain, (UInt32)bytes.length, bytes.bytes, YES);
            if (status == errSecSuccess) status = readKey(service, keychain, NO, &loaded);
            if (keychain) CFRelease(keychain);
            BOOL matches = status == errSecSuccess && [loaded isEqualToString:@"public-fixture-not-a-real-api-key"];
            emit(@{ @"matches":@(matches) }); return matches ? 0 : 1;
        }
        OSStatus status = errSecParam;
        if ([operation isEqualToString:@"status"]) {
            status = exists(Service, NULL);
            if (status == errSecSuccess || status == errSecItemNotFound) { emit(@{ @"stored":@(status == errSecSuccess) }); return 0; }
        } else if ([operation isEqualToString:@"save"]) {
            NSString *key = input()[@"key"];
            if (![key isKindOfClass:NSString.class] || key.length < 1 || key.length > 500 || [key rangeOfCharacterFromSet:NSCharacterSet.controlCharacterSet].location != NSNotFound) { emit(@{ @"error":@"invalid_key" }); return 1; }
            status = store(key, Service, NULL);
            if (status == errSecSuccess) { emit(@{ @"stored":@YES }); return 0; }
        } else if ([@[@"load", @"load-interactive"] containsObject:operation]) {
            NSString *key = nil; status = readKey(Service, NULL, interactive, &key);
            if (status == errSecSuccess && key.length) { emit(@{ @"key":key }); return 0; } // Private pipe to application only.
        } else if ([operation isEqualToString:@"delete"]) {
            status = removeKey(Service, NULL, YES);
            if (status == errSecSuccess || status == errSecItemNotFound) { emit(@{ @"stored":@NO }); return 0; }
        }
        emit(@{ @"error":errorCode(status), @"os_status":@(status) }); return 1;
    }
}
