import { BaseProxyHandler, ReactiveMembraneShadowTarget } from './base-handler';

const mapping = new WeakMap<any, any>;

function transformOp(handler, op, reverse) {
	return thatOp
	
	function thatOp(this: any, value: any) {
		const thatThis  = handler.transformValue(this, !reverse)
		const thatValue = handler.transformValue(value, !reverse);
		const result = op.call(thatThis, thatValue);
		return handler.transformValue(result, reverse);
	}
}

function cachedTransformOp(mapping, handler, op, reverse) {
	if (mapping.has(op)) return mapping.get(op)
	const thatOp = transformOp(handler, op, reverse)
	mapping.set(thatOp, op)
	mapping.set(op, thatOp)
	return thatOp
}

export class ReactiveProxyHandler extends BaseProxyHandler {
    wrapValue(value: any): any {
        return this.membrane.getProxy(value);
    }
    wrapGetter(op: () => void): () => any {
        return cachedTransformOp(mapping, this, op, false);
    }
    wrapSetter(op: (v: any) => void): (v: any) => void {
        return cachedTransformOp(mapping, this, op, false);
    }
    private unwrapDescriptor(descriptor: PropertyDescriptor): PropertyDescriptor {
        if (descriptor.hasOwnProperty("value")) 
        	descriptor.value = this.unwrapValue(descriptor.value);
        if (descriptor.get !== undefined) 
        	descriptor.get = this.unwrapGetter(descriptor.get);
        if (descriptor.set !== undefined) 
        	descriptor.set = this.unwrapSetter(descriptor.set);
        return descriptor;
    }
    private unwrapGetter(op: () => any): () => any {
        return cachedTransformOp(mapping, this, op, true);
    }
    private unwrapSetter(op: (v: any) => void): (v: any) => void {
        return cachedTransformOp(mapping, this, op, true);
    }
    set(shadowTarget: ReactiveMembraneShadowTarget, key: PropertyKey, value: any): boolean {
        if (this.originalTarget[key] !== value) {
            this.originalTarget[key] = value;
            this.membrane.valueMutated(this.originalTarget, key);
        	return true;
        } 
        if (key === 'length' && Array.isArray(this.originalTarget)) {
            // fix for issue #236: push will add the new index, and by the time length
            // is updated, the internal length is already equal to the new length value
            // therefore, the oldValue is equal to the value. This is the forking logic
            // to support this use case.
            this.membrane.valueMutated(this.originalTarget, key);
        }
        return true;
    }
    deleteProperty(shadowTarget: ReactiveMembraneShadowTarget, key: PropertyKey): boolean {
        delete this.originalTarget[key];
        this.membrane.valueMutated(this.originalTarget, key);
        return true;
    }
    preventExtensions(shadowTarget: ReactiveMembraneShadowTarget): boolean {
        if (!Object.isExtensible(shadowTarget)) return true;
        Object.preventExtensions(this.originalTarget);
        // if the originalTarget is a proxy itself, it might reject
        // the preventExtension call, in which case we should not attempt to lock down
        // the shadow target.
        if (Object.isExtensible(this.originalTarget)) return false;
        this.lockShadowTarget(shadowTarget);
        return true;
    }
    defineProperty(shadowTarget: ReactiveMembraneShadowTarget, key: PropertyKey, descriptor: PropertyDescriptor): boolean {
        if (key === this.membrane.tagPropertyKey && !Object.hasOwnProperty.call(this.originalTarget, key)) {
            // To avoid leaking the membrane tag property into the original target, we must
            // be sure that the original target doesn't have yet.
            // NOTE: we do not return false here because Object.freeze and equivalent operations
            // will attempt to set the descriptor to the same value, and expect no to throw. This
            // is an small compromise for the sake of not having to diff the descriptors.
            return true;
        }
        Object.defineProperty(this.originalTarget, key, this.unwrapDescriptor(descriptor));
        // intentionally testing if false since it could be undefined as well
        if (descriptor.configurable === false) {
            this.copyDescriptorIntoShadowTarget(shadowTarget, key);
        }
        this.membrane.valueMutated(this.originalTarget, key);
        return true;
    }
}

function toString(obj: any): string {
    if (obj && obj.toString) {
        return obj.toString();
    } 
    if (typeof obj === 'object') {
        return Object.prototype.toString.call(obj);
    } 
    return obj + '';
}
